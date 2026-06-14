import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import db from './server/db.js';
import {
  analyzeLogs,
  analyzeScreenshot,
  analyzeSlackChat,
  correlateAndDiagnose,
  generatePostmortem,
  findSimilarIncident,
} from './server/gemini.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON body parser with 50mb limit for base64 screenshot uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 1. GET /api/dashboard/stats -- Calculates aggregated dashboard metrics
  app.get('/api/dashboard/stats', (req, res) => {
    try {
      const totalIncidents = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
      const openIncidents = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status != 'RESOLVED'").get() as { count: number };
      const resolvedIncidents = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status = 'RESOLVED'").get() as { count: number };

      const severities = db.prepare(`
        SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity
      `).all() as { severity: string; count: number }[];

      const severityMap: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      severities.forEach((s) => {
        if (s.severity in severityMap) {
          severityMap[s.severity] = s.count;
        }
      });

      // Recent activity feed
      const recentIncidents = db.prepare(`
        SELECT id, title, severity, status, created_at FROM incidents ORDER BY created_at DESC LIMIT 5
      `).all();

      res.json({
        total: totalIncidents.count,
        open: openIncidents.count,
        resolved: resolvedIncidents.count,
        severities: severityMap,
        recent: recentIncidents,
      });
    } catch (error: any) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. GET /api/incidents -- Lists all incidents
  app.get('/api/incidents', (req, res) => {
    try {
      const incidents = db.prepare('SELECT * FROM incidents ORDER BY created_at DESC').all();
      res.json(incidents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. GET /api/incidents/:id -- Fetches details of a specific incident
  app.get('/api/incidents/:id', (req, res) => {
    try {
      const incidentId = req.params.id;
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Fetch related logs and screenshots
      const logs = db.prepare('SELECT * FROM logs WHERE incident_id = ? ORDER BY created_at ASC').all();
      const screenshots = db.prepare('SELECT id, incident_id, analysis, created_at FROM screenshots WHERE incident_id = ? ORDER BY created_at ASC').all();
      const postmortem = db.prepare('SELECT * FROM postmortems WHERE incident_id = ?').get(incidentId);

      res.json({
        ...incident,
        logs,
        screenshots,
        postmortem: postmortem ? (postmortem as any).content : null,
      });
    } catch (error: any) {
      console.error('Error obtaining incident details:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 4. POST /api/incidents -- Creates a new empty incident
  app.post('/api/incidents', (req, res) => {
    try {
      const { title, severity } = req.body;
      const id = 'INC-' + Date.now().toString().slice(-6);
      const createdAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO incidents (
          id, title, severity, status, created_at, root_cause, suggested_fixes, timeline,
          resolution, affected_services, evidence, confidence_score, likely_trigger, deployment_info
        ) VALUES (?, ?, ?, 'OPEN', ?, NULL, NULL, '[]', NULL, NULL, NULL, NULL, NULL, NULL)
      `).run(id, title || 'New production disruption', severity || 'MEDIUM', createdAt);

      // Add initialized timeline item
      const initialTimeline = [{ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: 'Incident War Room established. Initiating logs review.', source: 'System' }];
      db.prepare('UPDATE incidents SET timeline = ? WHERE id = ?').run(JSON.stringify(initialTimeline), id);

      res.status(201).json({ id, title, severity, status: 'OPEN', created_at: createdAt });
    } catch (error: any) {
      console.error('Error creating incident:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. POST /api/incidents/:id/logs -- Appends and analyzes logs
  app.post('/api/incidents/:id/logs', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { content, type } = req.body; // type: app, nginx, error, txt

      if (!content) {
        return res.status(400).json({ error: 'Log content is required' });
      }

      // 1. Get current incident
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // 2. Save log record
      const logId = 'LOG-' + Date.now().toString().slice(-6);
      db.prepare(`
        INSERT INTO logs (id, incident_id, content, type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(logId, incidentId, content, type || 'app', new Date().toISOString());

      // Update status to INVESTIGATING
      db.prepare("UPDATE incidents SET status = 'INVESTIGATING' WHERE id = ?").run(incidentId);

      // 3. Trigger Gemini log analysis
      const analysis = await analyzeLogs(content, type || 'app');

      // 4. Merge timeline
      let existingTimeline = [];
      try {
        existingTimeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        existingTimeline = [];
      }

      const logTimestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newTimelineEvents = analysis.timelineEvents.map((evt) => ({
        time: evt.time,
        text: `${evt.text} (from parsed ${type} logs)`,
        source: 'Logs',
      }));

      const mergedTimeline = [...existingTimeline, ...newTimelineEvents];

      // 5. Save updated incident analysis details back to SQLite
      db.prepare(`
        UPDATE incidents
        SET root_cause = ?,
            suggested_fixes = ?,
            timeline = ?,
            severity = ?,
            confidence_score = ?,
            likely_trigger = ?,
            affected_services = ?,
            evidence = ?
        WHERE id = ?
      `).run(
        analysis.root_cause,
        JSON.stringify(analysis.suggested_fixes),
        JSON.stringify(mergedTimeline),
        analysis.severity || incident.severity,
        analysis.confidence_score,
        analysis.likely_trigger,
        analysis.affected_services.join(', '),
        analysis.evidence,
        incidentId
      );

      res.json({ success: true, analysis });
    } catch (error: any) {
      console.error('Error analyzing logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 6. POST /api/incidents/:id/screenshots -- Uploads and analyzes screenshot
  app.post('/api/incidents/:id/screenshots', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { dataUrl, mimeType } = req.body;

      if (!dataUrl) {
        return res.status(400).json({ error: 'Screenshot data url is required' });
      }

      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Save screenshot record
      const screenshotId = 'SCR-' + Date.now().toString().slice(-6);
      
      // Analyze with Gemini
      const analysisResult = await analyzeScreenshot(dataUrl, mimeType || 'image/png');

      db.prepare(`
        INSERT INTO screenshots (id, incident_id, data_url, analysis, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(screenshotId, incidentId, dataUrl, JSON.stringify(analysisResult), new Date().toISOString());

      // Update incident timeline & status
      let existingTimeline = [];
      try {
        existingTimeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        existingTimeline = [];
      }

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const screenshotTimelineEvent = {
        time: timestamp,
        text: `Screenshot uploaded: ${analysisResult.summary.substring(0, 100)}...`,
        source: 'Screenshot',
      };

      const updatedTimeline = [...existingTimeline, screenshotTimelineEvent];
      db.prepare("UPDATE incidents SET timeline = ?, status = 'INVESTIGATING' WHERE id = ?").run(
        JSON.stringify(updatedTimeline),
        incidentId
      );

      res.json({ success: true, screenshotId, analysis: analysisResult });
    } catch (error: any) {
      console.error('Error upload screenshot:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 7. POST /api/incidents/:id/chats -- Analyzes Slack pasted chats
  app.post('/api/incidents/:id/chats', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { chatLog } = req.body;

      if (!chatLog) {
        return res.status(400).json({ error: 'chatLog content is required' });
      }

      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Analyze chat
      const slackAnalysis = await analyzeSlackChat(chatLog);

      // Append chat logs to list of timeline
      let existingTimeline = [];
      try {
        existingTimeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        existingTimeline = [];
      }

      const chatTimelineEvents = slackAnalysis.timelineEvents.map((evt) => ({
        time: evt.time,
        text: `${evt.text} (Slack War Room discussions)`,
        source: 'Chat',
      }));

      const mergedTimeline = [...existingTimeline, ...chatTimelineEvents];

      // Update incident with timeline and additional chat notes if desired
      db.prepare("UPDATE incidents SET timeline = ?, status = 'INVESTIGATING' WHERE id = ?").run(
        JSON.stringify(mergedTimeline),
        incidentId
      );

      res.json({ success: true, analysis: slackAnalysis });
    } catch (error: any) {
      console.error('Error during Slack chat parsing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 8. POST /api/incidents/:id/deployments -- Correlates deployment information
  app.post('/api/incidents/:id/deployments', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { commitId, notes, timestamp } = req.body;

      if (!commitId) {
        return res.status(400).json({ error: 'Commit ID is required' });
      }

      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const deploymentObj = { commitId, notes, timestamp: timestamp || new Date().toISOString() };
      
      // Update deployment metadata on incident
      db.prepare('UPDATE incidents SET deployment_info = ? WHERE id = ?').run(
        JSON.stringify(deploymentObj),
        incidentId
      );

      // Add deployment action to timeline
      let existingTimeline = [];
      try {
        existingTimeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        existingTimeline = [];
      }

      const deployTime = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const deployTimelineEvent = {
        time: deployTime,
        text: `Deployment initiated: Commit ${commitId} (${notes})`,
        source: 'Deployment',
      };

      const updatedTimeline = [...existingTimeline, deployTimelineEvent];

      // Trigger Master Correlation across logs, chats, screenshots, deployments
      const relatedLogs = db.prepare('SELECT * FROM logs WHERE incident_id = ?').all();
      const relatedScreenshots = db.prepare('SELECT * FROM screenshots WHERE incident_id = ?').all();
      const screenshotAnalyses = relatedScreenshots.map((scr: any) => {
        try {
          const parsed = JSON.parse(scr.analysis);
          return `Summary: ${parsed.summary}\nExtracted text: ${parsed.extractedText}`;
        } catch (e) {
          return scr.analysis;
        }
      });

      // Recorrelate master timeline and diagnosis
      const correlationResult = await correlateAndDiagnose(
        relatedLogs,
        JSON.stringify(updatedTimeline.filter((t: any) => t.source === 'Chat')),
        [deploymentObj],
        screenshotAnalyses
      );

      // Update incident with overall correlated findings
      db.prepare(`
        UPDATE incidents
        SET timeline = ?,
            root_cause = ?,
            confidence_score = ?,
            likely_trigger = ?,
            severity = ?,
            affected_services = ?,
            evidence = ?,
            suggested_fixes = ?
        WHERE id = ?
      `).run(
        JSON.stringify(correlationResult.timeline),
        correlationResult.root_cause,
        correlationResult.confidence_score,
        correlationResult.likely_trigger,
        correlationResult.severity,
        correlationResult.affected_services,
        correlationResult.evidence,
        JSON.stringify(correlationResult.suggested_fixes),
        incidentId
      );

      res.json({ success: true, correlation: correlationResult });
    } catch (error: any) {
      console.error('Error during deploy correlation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 9. POST /api/incidents/:id/postmortem/generate -- Generates full postmortem
  app.post('/api/incidents/:id/postmortem/generate', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      let timelineEvents = [];
      try {
        timelineEvents = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        timelineEvents = [];
      }

      let fixObj = { preventive: [] };
      try {
        fixObj = JSON.parse(incident.suggested_fixes || '{"preventive":[]}');
      } catch (e) {
        fixObj = { preventive: [] };
      }

      const markdownPostmortem = await generatePostmortem(
        incident.title,
        incident.severity,
        incident.root_cause || 'Root cause investigation in progress.',
        timelineEvents,
        incident.affected_services || 'unclassified-components',
        fixObj.preventive || []
      );

      // Save postmortem
      const pmId = 'PM-' + Date.now().toString().slice(-6);
      db.prepare(`
        INSERT INTO postmortems (id, incident_id, content, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(incident_id) DO UPDATE SET content = excluded.content
      `).run(pmId, incidentId, markdownPostmortem, new Date().toISOString());

      res.json({ success: true, markdown: markdownPostmortem });
    } catch (error: any) {
      console.error('Error generating postmortem:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 10. GET /api/incidents/:id/postmortem -- Retrieves existing postmortem
  app.get('/api/incidents/:id/postmortem', (req, res) => {
    try {
      const incidentId = req.params.id;
      const pmRecord = db.prepare('SELECT * FROM postmortems WHERE incident_id = ?').get(incidentId) as any;
      if (!pmRecord) {
        return res.json({ markdown: null });
      }
      res.json({ markdown: pmRecord.content });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 11. POST /api/incidents/:id/resolve -- Marks incident as RESOLVED
  app.post('/api/incidents/:id/resolve', (req, res) => {
    try {
      const incidentId = req.params.id;
      const { resolution } = req.body;

      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      db.prepare("UPDATE incidents SET status = 'RESOLVED', resolution = ? WHERE id = ?").run(
        resolution || 'Incident resolved and normal service profiles restored.',
        incidentId
      );

      // Add to timeline
      let timelineList = [];
      try {
        timelineList = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        timelineList = [];
      }

      const rTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timelineList.push({
        time: rTime,
        text: `Incident resolved: ${resolution || 'Services normalized.'}`,
        source: 'System',
      });

      db.prepare('UPDATE incidents SET timeline = ? WHERE id = ?').run(
         JSON.stringify(timelineList),
         incidentId
      );

      res.json({ success: true, status: 'RESOLVED' });
    } catch (error: any) {
      console.error('Error resolving incident:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 12. POST /api/incidents/:id/similar -- Intelligently matches similarities with memory
  app.post('/api/incidents/:id/similar', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Read past resolved incidents from db as memories (where id != currentId and status = RESOLVED)
      const historical = db.prepare("SELECT * FROM incidents WHERE status = 'RESOLVED' AND id != ?").all(incidentId);

      const matchResult = await findSimilarIncident(
        incident.title,
        incident.root_cause || 'Unknown',
        historical
      );

      res.json(matchResult);
    } catch (error: any) {
      console.error('Error matching similarities:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 13. POST /api/chaos/simulate -- Triggers SRE simulator configurations
  app.post('/api/chaos/simulate', (req, res) => {
    try {
      const { scenario } = req.body; // 'microservice_cascade', 'cache_invalidation_storm', 'cpu_throttling'
      const id = 'INC-SIM-' + Date.now().toString().slice(-4);
      const createdAt = new Date().toISOString();

      let title = '';
      let severity = 'CRITICAL';
      let rootCause = '';
      let likelyTrigger = '';
      let affectedServices = '';
      let confidenceScore = 90;
      let evidence = '';
      let suggestedFixesObj = { immediate: [] as string[], longTerm: [] as string[], preventive: [] as string[] };
      let timelineEvents: { time: string; text: string; source: string }[] = [];
      let logsList: { type: string; content: string }[] = [];

      if (scenario === 'microservice_cascade') {
        title = 'Distributed Stack-Tracing Cascade Failure on checkout-processor';
        severity = 'CRITICAL';
        rootCause = 'The checkout-processor node service failed to establish fallback timeouts or circuit-breaker closures during external bank gateway throttling. Outbound socket starvation quickly consumed pool threads, leading to direct memory limit overflow and cascading gateway 502/504 errors.';
        likelyTrigger = 'Sudden upstream API latency spike from vendor checkout payment authorization endpoints.';
        affectedServices = 'checkout-processor, payment-gateway, k8s-mesh';
        confidenceScore = 95;
        evidence = '[FATAL] Thread pool checkout-workers exhausted. Socket timeout reached at client.js:52\n[WARN] API Gateway reports 100% upstream failure rate to /api/billing.';
        suggestedFixesObj = {
          immediate: [
            'Configure immediate route bypass for auxiliary transactions.',
            'Inject proxy request timeouts at nginx-gateway to prevent node thread starvation.'
          ],
          longTerm: [
            'Integrate a robust circuit-breaker library like Hystrix or opossum surrounding raw Stripe/bank calls.',
            'Establish fallback response profiles returning mock authorization states for offline-retry queues.'
          ],
          preventive: [
            'Setup proactive thread pool health checkers triggering autonomous rollbacks if socket queues sustain over 85%.'
          ]
        };
        timelineEvents = [
          { time: '21:10', text: 'Spike in checkout request duration on payments service', source: 'Logs' },
          { time: '21:12', text: 'Socket pool limit reached. TCP socket allocation failed with ENOBUFS', source: 'Logs' },
          { time: '21:15', text: 'Nginx gateway reports 504 Gateway Timeout on /api/v1/checkout', source: 'Logs' },
          { time: '21:18', text: 'War Room established automatically via chaos-mesh trigger', source: 'System' }
        ];
        logsList = [
          { type: 'app', content: '2026-06-14T21:10:02Z [ERROR] Failed to authorize transaction TXN-91A25. Timeout of 3000ms exceeded calling api.vendor.internal\n2026-06-14T21:10:05Z [WARN] Thread pool size is currently at 45/50 dynamic threads.' },
          { type: 'error', content: '2026-06-14T21:12:12Z [FATAL] uncaughtException: econnreset Connection reset by peer at TCPConnectWrap.afterConnect\n2026-06-14T21:12:15Z [PANIC] Process crashed from OOM. Stacktrace: Heap memory limits exceeded (512MB reached).' },
          { type: 'nginx', content: '64.91.22.10 - - [14/Jun/2026:21:15:00 +0000] "POST /api/v1/checkout HTTP/1.1" 504 182 "-" "SRE-Monitor-Agent/1.0"' }
        ];
      } else if (scenario === 'cache_invalidation_storm') {
        title = 'Redis memory fragmentation and Hot-Key Eviction Storm on products-feed-cache';
        severity = 'HIGH';
        rootCause = 'A mass marketing push triggered bulk database cache invalidations on 24,000 active SKU items concurrently. Bypassed cache lookups provoked an immediate thundering herd read-storm directly targeting our read-replicas, leading to query exhaustion and high response latency spikes.';
        likelyTrigger = 'Running global inventory update operations inside checkout dashboard.';
        affectedServices = 'products-feed-cache, catalog-service, postgres-replica';
        confidenceScore = 88;
        evidence = 'Redis monitor: "volatile-lru eviction executed on hot-key collections" and database read connection queue spikes.';
        suggestedFixesObj = {
          immediate: [
            'Dampen thundering herd spikes by executing local cache lock guards (single-flight locking).',
            'Manually provision 2 additional read-replica database nodes in AWS.'
          ],
          longTerm: [
            'Transition products-feed-cache to cluster sharding with redundant master nodes.',
            'Implement probabilistic cache key expiry strategies to reduce batch invalidation storms.'
          ],
          preventive: [
            'Configure hard alerts warning of database buffer cache hit ratio falling below 90%.'
          ]
        };
        timelineEvents = [
          { time: '14:02', text: 'Inventory script invalidates metadata keys in products-feed-cache', source: 'System' },
          { time: '14:04', text: 'Cache eviction warnings reported across Redis clusters', source: 'Logs' },
          { time: '14:08', text: 'Database read queue duration spikes to 4200 milliseconds', source: 'Logs' },
          { time: '14:12', text: 'Catalog services latency reaches 7800ms P99 SLA trigger', source: 'Logs' }
        ];
        logsList = [
          { type: 'app', content: '2026-06-14T14:02:11Z [INFO] Inventory cron task initialized. Mass SKU metadata invalidate dispatched.' },
          { type: 'error', content: '2026-06-14T14:04:15Z [WARN] Memcached/Redis client: Hot key eviction detected on SKU:9182, SKU:1102. Evicted 12,000 keys of policy LRU.' },
          { type: 'app', content: '2026-06-14T14:08:30Z [DB_PERF] Query duration alert: SELECT * FROM products WHERE id = $1 was running for 5100ms.' }
        ];
      } else {
        // CPU Throttling
        title = 'Kubernetes CPU Quota Throttling on oauth2-service-replica';
        severity = 'MEDIUM';
        rootCause = 'The Kubernetes oauth2 service configuration specified a tight CPU limit of 0.5 cores. During intense authentication surges, the cryptographical calculations (Bcrypt hashing loops) pegged CPU allocations, causing hypervisor process throttling and leading to immense signature response delays.';
        likelyTrigger = 'Surge in user concurrent login processes during flash-sale launch.';
        affectedServices = 'oauth2-service, user-auth-api';
        confidenceScore = 85;
        evidence = 'Node metrics: "CpuUsage: p99 at 498mS out of 500mS limits", cgroups throttling statistics increase.';
        suggestedFixesObj = {
          immediate: [
            'Temporarily lift CPU limit spec in Helm templates to 2.0 cores.',
            'Redistribute active login pools into non-throttled auxiliary server profiles.'
          ],
          longTerm: [
            'Adopt asynchronous multi-threaded user cryptographical execution layers.',
            'Adopt faster, dedicated CPU hashing hardware architectures or transit crypt hashes to specialized auth-brokers.'
          ],
          preventive: [
            'Define container alert sensors measuring cgroups cpu.stat throttled_time metrics.'
          ]
        };
        timelineEvents = [
          { time: '10:30', text: 'Bcrypt cryptographic load spikes during product sale', source: 'System' },
          { time: '10:32', text: 'Container CPU throttling detected by hypervisor engine', source: 'Logs' },
          { time: '10:35', text: 'JWT sign times delay jumps to 6200ms', source: 'Logs' }
        ];
        logsList = [
          { type: 'app', content: '2026-06-14T10:30:15Z [INFO] Processing password signup Bcrypt validation. Work factor: 12' },
          { type: 'error', content: '2026-06-14T10:32:01Z [CGROUPS_WARN] Container oauth2-pod-a2fd throttled. throttled_time: 25430ms' },
          { type: 'app', content: '2026-06-14T10:35:10Z [WARN] JWT compilation lag: response signatures deferred for 6100ms' }
        ];
      }

      // 1. Insert incident
      db.prepare(`
        INSERT INTO incidents (
          id, title, severity, status, created_at, root_cause, suggested_fixes, timeline,
          resolution, affected_services, evidence, confidence_score, likely_trigger, deployment_info
        ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)
      `).run(
        id,
        title,
        severity,
        createdAt,
        rootCause,
        JSON.stringify(suggestedFixesObj),
        JSON.stringify(timelineEvents),
        affectedServices,
        evidence,
        confidenceScore,
        likelyTrigger
      );

      // 2. Insert mock logs so they correspond beautifully in database
      const insertLogStmt = db.prepare(`
        INSERT INTO logs (id, incident_id, content, type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      logsList.forEach((log, index) => {
        const logId = 'LOG-SIM-' + Date.now().toString().slice(-4) + '-' + index;
        insertLogStmt.run(logId, id, log.content, log.type, createdAt);
      });

      res.status(201).json({ success: true, id, title, severity, created_at: createdAt });
    } catch (e: any) {
      console.error('Error executing chaos simulation:', e);
      res.status(500).json({ error: e.message });
    }
  });


  // ====================================================
  // GITHUB INTEGRATION ROUTING
  // ====================================================

  // 1. GET /api/github/settings -- Retrieves active integration status
  app.get('/api/github/settings', (req, res) => {
    try {
      const setting = db.prepare('SELECT * FROM github_settings WHERE id = ?').get('default') as any;
      if (!setting || !setting.access_token) {
        return res.json({ connected: false });
      }
      res.json({
        connected: true,
        repo_owner: setting.repo_owner,
        repo_name: setting.repo_name,
        authenticated_user: setting.authenticated_user,
        avatar_url: setting.avatar_url,
        created_at: setting.created_at
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. POST /api/github/settings -- Update / save credentials manually (PAT config)
  app.post('/api/github/settings', async (req, res) => {
    try {
      const { access_token, repository } = req.body; // repository format e.g. "owner/name"
      if (!access_token) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      // Parse repository
      let owner = '';
      let name = '';
      if (repository) {
        const parts = repository.replace(/^(https:\/\/github\.com\/)/, '').split('/');
        if (parts.length >= 2) {
          owner = parts[0].trim();
          name = parts[1].trim();
        } else if (parts.length === 1 && parts[0].includes(':')) {
          // split by colon if colon is used
          const subParts = parts[0].split(':');
          if (subParts.length >= 2) {
            owner = subParts[0].trim();
            name = subParts[1].trim();
          }
        }
      }

      // Verify token with GitHub APIs
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-War-Room-SRE-Agent'
        }
      });

      if (!userRes.ok) {
        const errDetails = await userRes.text();
        return res.status(userRes.status).json({ error: `GitHub authorization failed. Revise token scope/permissions. Details: ${errDetails}` });
      }

      const userData = await userRes.json() as any;
      const authenticatedUser = userData.login;
      const avatarUrl = userData.avatar_url;
      const createdAt = new Date().toISOString();

      // Clear existing settings & Insert new record
      db.prepare('DELETE FROM github_settings WHERE id = ?').run('default');
      db.prepare(`
        INSERT INTO github_settings (id, access_token, repo_owner, repo_name, authenticated_user, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', access_token, owner, name, authenticatedUser, avatarUrl, createdAt);

      res.json({
        success: true,
        connected: true,
        repo_owner: owner,
        repo_name: name,
        authenticated_user: authenticatedUser,
        avatar_url: avatarUrl
      });
    } catch (e: any) {
      console.error('GitHub config error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 3. DELETE /api/github/settings -- Disconnect integration
  app.delete('/api/github/settings', (req, res) => {
    try {
      db.prepare('DELETE FROM github_settings WHERE id = ?').run('default');
      res.json({ success: true, connected: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. POST /api/incidents/:id/github-issue -- Creates an issue for this incident
  app.post('/api/incidents/:id/github-issue', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { customTitle, customBody } = req.body;

      // Check settings database
      const setting = db.prepare('SELECT * FROM github_settings WHERE id = ?').get('default') as any;
      if (!setting || !setting.access_token || !setting.repo_owner || !setting.repo_name) {
        return res.status(400).json({ error: 'GitHub is not connected or configured with a target repository.' });
      }

      // Find incident
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // Compile Issue payload
      const title = customTitle || `[SRE OUTAGE ${incident.severity}] ${incident.title} (${incident.id})`;
      let defaultBody = `## Incident SRE Report\n\n`;
      defaultBody += `**Incident ID:** \`${incident.id}\`\n`;
      defaultBody += `**Severity:** \`${incident.severity}\`\n`;
      defaultBody += `**Current Status:** \`${incident.status}\`\n`;
      defaultBody += `**Establishment Time:** ${new Date(incident.created_at).toLocaleString()}\n\n`;
      
      if (incident.root_cause) {
        defaultBody += `### Root Cause Analysis\n${incident.root_cause}\n\n`;
      }
      if (incident.likely_trigger) {
        defaultBody += `**Likely Trigger:** ${incident.likely_trigger}\n\n`;
      }
      if (incident.evidence) {
        defaultBody += `### Supporting Evidence / Error Trace\n\`\`\`\n${incident.evidence}\n\`\`\`\n\n`;
      }

      const body = customBody || defaultBody;

      // Dispatch POST to GitHub Issues
      const route = `https://api.github.com/repos/${setting.repo_owner}/${setting.repo_name}/issues`;
      const ghRes = await fetch(route, {
        method: 'POST',
        headers: {
          'Authorization': `token ${setting.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'AI-War-Room-SRE-Agent'
        },
        body: JSON.stringify({ title, body })
      });

      if (!ghRes.ok) {
        const text = await ghRes.text();
        throw new Error(`GitHub responded with ${ghRes.status}: ${text}`);
      }

      const resData = await ghRes.json() as any;
      const issueUrl = resData.html_url;
      const issueNumber = resData.number;

      // Update incident timeline and note issue connection
      let timeline = [];
      try {
        timeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        timeline = [];
      }

      timeline.push({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Exported disaster telemetry. Created GitHub Issue #${issueNumber} on repository ${setting.repo_owner}/${setting.repo_name}`,
        source: 'System'
      });

      db.prepare('UPDATE incidents SET timeline = ? WHERE id = ?').run(JSON.stringify(timeline), incidentId);

      res.json({ success: true, url: issueUrl, number: issueNumber });
    } catch (e: any) {
      console.error('Error opening GitHub Issue:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 5. POST /api/incidents/:id/github-patch-pr -- Submits a Pull Request for a proposed SRE fix
  app.post('/api/incidents/:id/github-patch-pr', async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { path: filePath, patchContent, fixDescription } = req.body;

      if (!filePath || !patchContent) {
        return res.status(400).json({ error: 'Target path and patch content are required' });
      }

      // Check settings database
      const setting = db.prepare('SELECT * FROM github_settings WHERE id = ?').get('default') as any;
      if (!setting || !setting.access_token || !setting.repo_owner || !setting.repo_name) {
        return res.status(400).json({ error: 'GitHub is not connected or configured with a target repository.' });
      }

      // Find incident
      const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const headers = {
        'Authorization': `token ${setting.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AI-War-Room-SRE-Agent'
      };

      // A. Fetch default branch name and latest commit SHA
      const repoUrl = `https://api.github.com/repos/${setting.repo_owner}/${setting.repo_name}`;
      const repoRes = await fetch(repoUrl, { headers });
      if (!repoRes.ok) {
        const text = await repoRes.text();
        throw new Error(`Failed to fetch repository information: ${text}`);
      }
      const repoData = await repoRes.json() as any;
      const defaultBranch = repoData.default_branch || 'main';

      // B. Fetch last commit of default branch
      const branchRes = await fetch(`${repoUrl}/branches/${defaultBranch}`, { headers });
      if (!branchRes.ok) {
        throw new Error(`Failed to retrieve branch metadata for ${defaultBranch}`);
      }
      const branchData = await branchRes.json() as any;
      const baseCommitSha = branchData.commit.sha;

      // C. Create a unique branch name
      const uniqueBranch = `sre-patch-${incidentId}-${Date.now().toString().slice(-4)}`;

      // D. Register the new reference
      const refRes = await fetch(`${repoUrl}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${uniqueBranch}`,
          sha: baseCommitSha
        })
      });
      if (!refRes.ok) {
        const text = await refRes.text();
        throw new Error(`Failed to establish branch '${uniqueBranch}': ${text}`);
      }

      // E. Check if target file exists on this branch to obtain SHA
      let fileSha: string | undefined = undefined;
      const fileCheckUrl = `${repoUrl}/contents/${encodeURIComponent(filePath)}?ref=${uniqueBranch}`;
      const fileRes = await fetch(fileCheckUrl, { headers });
      if (fileRes.ok) {
        const fileData = await fileRes.json() as any;
        fileSha = fileData.sha;
      }

      // F. Put file contents
      const contentBase64 = Buffer.from(patchContent).toString('base64');
      const putFileUrl = `${repoUrl}/contents/${encodeURIComponent(filePath)}`;
      const putRes = await fetch(putFileUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `fix(sre): autonomous mitigation patch for ${incidentId}`,
          content: contentBase64,
          branch: uniqueBranch,
          sha: fileSha
        })
      });

      if (!putRes.ok) {
        const text = await putRes.text();
        throw new Error(`Could not commit hotfix code patch: ${text}`);
      }

      // G. Create Pull Request
      const pullsUrl = `${repoUrl}/pulls`;
      const prRes = await fetch(pullsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `fix(hotfix): patch recommendations for ${incident.id}`,
          head: uniqueBranch,
          base: defaultBranch,
          body: `This Pull Request was generated automatically by SRE War Room to resolve incident **${incident.id}: ${incident.title}**.\n\n### Fix Description\n${fixDescription || 'Applying recommended corrective structural modifications.'}\n\n### System Evidence\n${incident.evidence || 'N/A'}`
        })
      });

      if (!prRes.ok) {
        const text = await prRes.text();
        throw new Error(`Failed to open Pull Request on GitHub: ${text}`);
      }

      const prData = await prRes.json() as any;
      const prUrl = prData.html_url;
      const prNumber = prData.number;

      // H. Update Incident Timeline
      let timeline = [];
      try {
        timeline = JSON.parse(incident.timeline || '[]');
      } catch (e) {
        timeline = [];
      }

      timeline.push({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Opened SRE mitigation PR #${prNumber} addressing path '/${filePath}' on branch '${uniqueBranch}'`,
        source: 'System'
      });

      db.prepare('UPDATE incidents SET timeline = ? WHERE id = ?').run(JSON.stringify(timeline), incidentId);

      res.json({ success: true, url: prUrl, number: prNumber, branch: uniqueBranch });
    } catch (e: any) {
      console.error('Error creating Pull Request:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 6. GET /api/github/oauth/url - Generates OAuth authorize url if GITHUB_CLIENT_ID is provided
  app.get('/api/github/oauth/url', (req, res) => {
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return res.json({ oauthEnabled: false, message: 'OAuth credentials not set up' });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;
      res.json({ oauthEnabled: true, url: authUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 7. GET /auth/callback -- OAuth token exchange & user save popup router
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.send('<h3>Authentication Failed: Missing authorization code.</h3>');
    }

    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Server environment lacks GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET config');
      }

      // Exchange code for OAuth credentials token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenRes.ok) {
        throw new Error('Failed exchanging authentication code');
      }

      const tokenData = await tokenRes.json() as any;
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        throw new Error(tokenData.error_description || 'Access token response was empty');
      }

      // Read profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-War-Room-SRE-Agent'
        }
      });

      const userData = await userRes.json() as any;
      const authenticatedUser = userData.login;
      const avatarUrl = userData.avatar_url;
      const createdAt = new Date().toISOString();

      // Clear existing settings & Insert new record (leave repository blank for them to select)
      db.prepare('DELETE FROM github_settings WHERE id = ?').run('default');
      db.prepare(`
        INSERT INTO github_settings (id, access_token, repo_owner, repo_name, authenticated_user, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('default', accessToken, '', '', authenticatedUser, avatarUrl, createdAt);

      // Send postMessage success notification to SRE client and shut down the popup
      res.send(`
        <html>
          <body style="background:#18181b;color:#f4f4f5;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;border:1px solid #27272a;background:#09090b;padding:30px;border-radius:10px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);">
              <h2 style="color:#22c55e;margin-top:0;">✓ GitHub Connected!</h2>
              <p style="font-size:13px;color:#a1a1aa;margin-bottom:20px;">Authenticated successfully. Syncing incident trackers...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1200);
                } else {
                  window.location.href = '/';
                }
              </script>
              <div style="font-size:11px;color:#71717a;">Closing window automatically...</div>
            </div>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error('GitHub oauth error:', e);
      res.send(`
        <html>
          <body style="background:#18181b;color:#f4f4f5;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;border:1px solid #dc2626;background:#09090b;padding:30px;border-radius:10px;">
              <h2 style="color:#ef4444;margin-top:0;">✗ Authentication Failed</h2>
              <p style="font-size:12px;color:#a1a1aa;">Error: ${e.message}</p>
              <button onclick="window.close()" style="background:#27272a;border:1px solid #3f3f46;color:#f4f4f5;padding:8px 16px;border-radius:4px;cursor:pointer;margin-top:10px;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }
  });


  // ----------------------------------------------------
  // VITE SERVICE / STATIC ROUTING ASSETS
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI War Room running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
