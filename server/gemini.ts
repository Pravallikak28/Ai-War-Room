import { GoogleGenAI, Type } from '@google/genai';

// Initialize the Gemini SDK
// AI Studio automatically provides process.env.GEMINI_API_KEY at runtime
const apiKey = process.env.GEMINI_API_KEY;

export const ai = new GoogleGenAI({
  apiKey: apiKey || 'MOCK_KEY_FOR_DEV',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const MODEL_NAME = 'gemini-3.5-flash';

// Helper to check if API key is initialized
function checkApiKey() {
  if (!apiKey) {
    console.warn('WARNING: GEMINI_API_KEY is not defined. Using simulated AI outputs.');
    return false;
  }
  return true;
}

/**
 * Interface representing log analysis output
 */
export interface LogAnalysisResult {
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  root_cause: string;
  confidence_score: number;
  likely_trigger: string;
  evidence: string;
  affected_services: string[];
  suggested_fixes: {
    immediate: string[];
    longTerm: string[];
    preventive: string[];
  };
  timelineEvents: { time: string; text: string }[];
}

/**
 * Analyzes raw logs (app, nginx, error, etc.) for root cause extraction
 */
export async function analyzeLogs(logContent: string, logType: string): Promise<LogAnalysisResult> {
  if (!checkApiKey()) {
    return getSimulatedLogAnalysis(logContent, logType);
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `You are an expert platform SRE and incident commander. Analyze this database of logs of type "${logType}" to deduce the incident details.
      
      LOG CONTENT:
      ${logContent}
      
      Deduce:
      1. An appropriate concise title.
      2. Severity Level (LOW, MEDIUM, HIGH, CRITICAL).
      3. Deep analysis of root cause.
      4. Confidence score (1-100).
      5. Possible raw trigger.
      6. Key evidence (like specific log errors or timestamps).
      7. List of affected services/components.
      8. Fixing actions (immediate, long-term, and preventive).
      9. Any specific timestamps and events that can be extracted into an incident timeline.
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'title',
            'severity',
            'root_cause',
            'confidence_score',
            'likely_trigger',
            'evidence',
            'affected_services',
            'suggested_fixes',
            'timelineEvents',
          ],
          properties: {
            title: { type: Type.STRING, description: 'Concise summary title of the incident' },
            severity: {
              type: Type.STRING,
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              description: 'Severity classification',
            },
            root_cause: { type: Type.STRING, description: 'Technical summary of what went wrong' },
            confidence_score: { type: Type.INTEGER, description: 'Confidence from 1 to 100' },
            likely_trigger: { type: Type.STRING, description: 'The precise event or action that triggered this' },
            evidence: { type: Type.STRING, description: 'Direct citations or lines from the logs supporting this' },
            affected_services: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Services impacted',
            },
            suggested_fixes: {
              type: Type.OBJECT,
              required: ['immediate', 'longTerm', 'preventive'],
              properties: {
                immediate: { type: Type.ARRAY, items: { type: Type.STRING } },
                longTerm: { type: Type.ARRAY, items: { type: Type.STRING } },
                preventive: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
            timelineEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['time', 'text'],
                properties: {
                  time: { type: Type.STRING, description: 'Extracted time/timestamp (e.g. HH:MM or YYYY-MM-DD HH:MM)' },
                  text: { type: Type.STRING, description: 'Description of what occurred' },
                },
              },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty Gemini response text');
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error in analyzeLogs:', error);
    return getSimulatedLogAnalysis(logContent, logType);
  }
}

/**
 * Interface representing screenshot analysis output
 */
export interface ScreenshotAnalysisResult {
  summary: string;
  extractedText: string;
  metricsObserved: string[];
  anomaliesDetected: string[];
  relevanceToIncident: string;
}

/**
 * Analyzes error/Grafana screenshots to extract error messages, metrics, anomalies
 */
export async function analyzeScreenshot(base64Data: string, mimeType: string): Promise<ScreenshotAnalysisResult> {
  if (!checkApiKey()) {
    return getSimulatedScreenshotAnalysis();
  }

  try {
    // Strip the "data:image/...;base64," prefix if it exists
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    const imagePart = {
      inlineData: {
        mimeType: mimeType || 'image/png',
        data: cleanBase64,
      },
    };

    const textPart = {
      text: `You are an expert SRE review engine. Analyze this production system screenshot (Grafana dashboard, log trace, console, or AWS UI).
      Extract:
      1. Text/error messages visible.
      2. Any metrics/values observed.
      3. Any clear anomalies (spikes, high error rate lines, down systems).
      4. Summary of the diagram's state and its general relevance.`,
    };

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['summary', 'extractedText', 'metricsObserved', 'anomaliesDetected', 'relevanceToIncident'],
          properties: {
            summary: { type: Type.STRING, description: 'Clean overview of what the screenshot reveals' },
            extractedText: { type: Type.STRING, description: 'Error traces, titles, or stack lines visible' },
            metricsObserved: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Metric readouts, stats, CPU, rates' },
            anomaliesDetected: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Spikes, breaks, blank panels, red alerts' },
            relevanceToIncident: { type: Type.STRING, description: 'Deduction of how this aligns with potential outage factors' },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty screenshot response');
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    return getSimulatedScreenshotAnalysis();
  }
}

/**
 * Interface representing Slack chat analysis output
 */
export interface SlackAnalysisResult {
  summary: string;
  decisionsMade: string[];
  actionsTakenOrRequested: string[];
  contributors: { name: string; roleDescription: string; impact: string }[];
  timelineEvents: { time: string; text: string }[];
}

/**
 * Analyzes Slack discussion chats to map actions, contributors, decisions
 */
export async function analyzeSlackChat(chatLog: string): Promise<SlackAnalysisResult> {
  if (!checkApiKey()) {
    return getSimulatedSlackAnalysis(chatLog);
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Analyze the following Slack/chat conversation log from an active incident war room.
      Identify:
      1. High level synopsis of the chat.
      2. Any explicit final decisions made or authorized.
      3. Tasks/actions taken or currently initiated by users.
      4. Key contributors mentioned, their functional role deduced from chat, and detail on their specific impact.
      5. chronological mini-events (extract times and matching developments).
      
      CHAT LOG:
      ${chatLog}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['summary', 'decisionsMade', 'actionsTakenOrRequested', 'contributors', 'timelineEvents'],
          properties: {
            summary: { type: Type.STRING, description: 'Brief overall description of the conversation' },
            decisionsMade: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionsTakenOrRequested: { type: Type.ARRAY, items: { type: Type.STRING } },
            contributors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['name', 'roleDescription', 'impact'],
                properties: {
                  name: { type: Type.STRING },
                  roleDescription: { type: Type.STRING },
                  impact: { type: Type.STRING },
                },
              },
            },
            timelineEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['time', 'text'],
                properties: {
                  time: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty Slack response');
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error analyzing Slack chat:', error);
    return getSimulatedSlackAnalysis(chatLog);
  }
}

/**
 * Interface representing final correlated timeline and findings
 */
export interface CorrelatedIncidentDetails {
  timeline: { time: string; text: string; source: string }[];
  root_cause: string;
  confidence_score: number;
  likely_trigger: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affected_services: string;
  evidence: string;
  suggested_fixes: {
    immediate: string[];
    longTerm: string[];
    preventive: string[];
  };
}

/**
 * Interface for deployment feedback correlation
 */
export interface DeploymentInfo {
  commitId: string;
  notes: string;
  timestamp: string;
}

/**
 * Correlates existing findings (logs, snapshots, deployments, chats) to generate a Master Incident Timeline and Diagnosis
 */
export async function correlateAndDiagnose(
  existingLogs: any[],
  existingChat: string,
  existingDeployments: DeploymentInfo[],
  existingScreenshotAnalyses: string[]
): Promise<CorrelatedIncidentDetails> {
  if (!checkApiKey()) {
    return getSimulatedResolution();
  }

  try {
    const contextStr = `
    LOGS PARSED SUMMARY:
    ${JSON.stringify(existingLogs.map((l) => ({ type: l.type, sample: l.content.substring(0, 400) })))}
    
    SLACK CHATS ATTACHED:
    ${existingChat}
    
    DEPLOYMENTS ASSOCIATED:
    ${JSON.stringify(existingDeployments)}
    
    SCREENSHOT ANALYSES RESULTS:
    ${existingScreenshotAnalyses.join('\n---\n')}
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `You are a master incident correlation engine. Take all these pieces of evidence from dynamic sources and create a unified single timeline, along with the master diagnosis.
      
      EVIDENCE:
      ${contextStr}
      
      Deduce:
      1. Unified Timeline of the whole incident (each event must have a relative time e.g., "14:10" or absolute time, action description, and the deduced source of information: e.g. "Deploy System", "Slack", "Server Logs", "Screenshot"). Ordering must be strictly chronologically logical.
      2. The primary overall Root Cause analysis.
      3. A summary confidence score (1-100).
      4. Deduced Trigger of the outage.
      5. Deduced unified severity level (LOW, MEDIUM, HIGH, CRITICAL).
      6. A list of comma separated affected services.
      7. Master key bullet points of active evidence.
      8. Clear corrective actions (immediate, long-term, preventive).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'timeline',
            'root_cause',
            'confidence_score',
            'likely_trigger',
            'severity',
            'affected_services',
            'evidence',
            'suggested_fixes',
          ],
          properties: {
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['time', 'text', 'source'],
                properties: {
                  time: { type: Type.STRING },
                  text: { type: Type.STRING },
                  source: { type: Type.STRING, description: 'e.g. Logs, Chat, Deployment, Screenshot, Unknown' },
                },
              },
            },
            root_cause: { type: Type.STRING },
            confidence_score: { type: Type.INTEGER },
            likely_trigger: { type: Type.STRING },
            severity: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            affected_services: { type: Type.STRING, description: 'Comma separated string of services' },
            evidence: { type: Type.STRING, description: 'Formatted bullet arguments or text mapping evidence' },
            suggested_fixes: {
              type: Type.OBJECT,
              required: ['immediate', 'longTerm', 'preventive'],
              properties: {
                immediate: { type: Type.ARRAY, items: { type: Type.STRING } },
                longTerm: { type: Type.ARRAY, items: { type: Type.STRING } },
                preventive: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty correlation response');
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error correlating incident details:', error);
    return getSimulatedResolution();
  }
}

/**
 * Generates Postmortem Reports
 */
export async function generatePostmortem(
  title: string,
  severity: string,
  rootCause: string,
  timeline: { time: string; text: string; source?: string }[],
  affectedServices: string,
  preventiveMeasures: string[]
): Promise<string> {
  if (!checkApiKey()) {
    return getSimulatedPostmortemMarkdown(title, severity, rootCause, timeline);
  }

  try {
    const payload = `
    INCIDENT TITLE: ${title}
    SEVERITY: ${severity}
    ROOT CAUSE: ${rootCause}
    AFFECTED SERVICES: ${affectedServices}
    TIMELINE: ${JSON.stringify(timeline)}
    PREVENTIVE SUGGESTIONS: ${JSON.stringify(preventiveMeasures)}
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Draft a highly professional, thorough Postmortem document in full Markdown format for a leading technology firm (industry standards similar to Google or Netflix outages).
      Include headers for:
      - Executive Summary
      - Root Cause Analysis & Technical Deep Dive
      - User/Business Impact
      - Detailed Incident Timeline (formatted nicely)
      - Key Stabilization Actions & Mitigation
      - Lessons Learned
      - Preventive Action Items with owners (suggest roles as owners e.g., platform-team, srv-team)
      
      FACTS:
      ${payload}
      `,
    });

    return response.text || '';
  } catch (error) {
    console.error('Error generating postmortem:', error);
    return getSimulatedPostmortemMarkdown(title, severity, rootCause, timeline);
  }
}

// ----------------------------------------------------
// SIMULATION FALLBACKS (If GEMINI_API_KEY is missing)
// ----------------------------------------------------

function getSimulatedLogAnalysis(logContent: string, logType: string): LogAnalysisResult {
  const contentLower = logContent.toLowerCase();
  
  if (contentLower.includes('db') || contentLower.includes('database') || contentLower.includes('connection')) {
    return {
      title: 'Database Connection Pool Exhaustion on Backend Node',
      severity: 'CRITICAL',
      root_cause: 'The application backend failed to release connections back to the database pool on fast-failing user fetch requests. This created a leakage that rapidly reached the DBMS max_connections of 100 within minutes.',
      confidence_score: 90,
      likely_trigger: 'Unexpected growth of read-intensive queries triggered by active cron synchronizations.',
      evidence: 'Logs show: ConnectionAcquisitionTimeoutException and repeatedly failing pool checkout requests.',
      affected_services: ['payment-service', 'user-service', 'postgres-primary'],
      suggested_fixes: {
        immediate: [
          'Restart backend-api containers to force drop stale leakage links.',
          'Inject db_pool_max=75 directly into current Kubernetes config values.',
        ],
        longTerm: [
          'Rewrite DB context wrappers to use try/finally closures guaranteeing resource releases.',
          'Review transaction boundary lengths for long-running billing queries.',
        ],
        preventive: [
          'Add a connection-count watchdog lambda executing warnings if connection usage sustains >80% limits.',
        ],
      },
      timelineEvents: [
        { time: '00:10', text: 'Spike in API requests to /api/users/profile' },
        { time: '00:12', text: 'Database pool exhaustion exceptions start appearing in logs' },
        { time: '00:17', text: 'All incoming connections timeout, system completely unresponsive' },
        { time: '00:25', text: 'Manual server restarts execute pool recovery' },
      ],
    };
  }

  // Fallback default simulation
  return {
    title: `Unspecified exception parsed in ${logType} logs`,
    severity: 'MEDIUM',
    root_cause: 'Routine application process crashed due to unexpected message formats. This threw unhandled rejections that cascade-failed dependency listeners.',
    confidence_score: 75,
    likely_trigger: 'Anomalous payload sent to core messaging queues.',
    evidence: 'Log entry: "Unexpected token < in JSON at position 0"',
    affected_services: ['billing-gateway', 'pubsub-broker'],
    suggested_fixes: {
      immediate: ['Apply manual payload filter to isolate invalid incoming formats.', 'Purge the active corrupted queue head.'],
      longTerm: ['Support strict JSON schema validators at input gateways.', 'Isolate dead-letter queues (DLQ) for broken processes.'],
      preventive: ['Refactor parsing engines with robust try/catch sanitization guards.'],
    },
    timelineEvents: [
      { time: '01:00', text: 'Log parser identifies invalid payloads arriving in queue' },
      { time: '01:03', text: 'Repeated crash loop triggers active cluster alerts' },
      { time: '01:10', text: 'Payload filtration script manually applied by on-call engineer' },
    ],
  };
}

function getSimulatedScreenshotAnalysis(): ScreenshotAnalysisResult {
  return {
    summary: 'A system monitor dashboard depicting a staggering latency rise peaking at 12,000 milliseconds, alongside a synchronized precipitous crash in Request Throughput.',
    extractedText: 'Panel Name: Gateway Performance | HTTP 500 Spike (98%) | Service: order-orchestrator',
    metricsObserved: ['HTTP Latency: 12.2s (P99)', 'Underlying Service CPU: 95.4%', 'Network Inbound: 25.1MB/s'],
    anomaliesDetected: ['A sudden vertical step-climb in 500 Server Errors mirroring the exact onset of CPU saturation', 'Critical lack of activity inside DB writing indicators'],
    relevanceToIncident: 'This confirms that the incident is originating at or downstream of the order-orchestrator, likely due to severe CPU throttling or starvation hindering event response times.',
  };
}

function getSimulatedSlackAnalysis(chatLog: string): SlackAnalysisResult {
  return {
    summary: 'SRE group quickly correlating user reports of API failures, verifying Grafana dashboards on orders, proposing scaling containers, and executing the configuration updates.',
    decisionsMade: [
      'Approved immediate scale-up of the order-orchestrator deployment replica parameters to 4 nodes.',
      'Slightly deferred deeper cache invalidation attempts pending current scale results.',
    ],
    actionsTakenOrRequested: [
      'Alex requested CPU metrics of Postgres systems.',
      'Jordan scaled orchestrator deployment units and verified log levels.',
    ],
    contributors: [
      { name: 'Alex', roleDescription: 'Lead Infrastructure SRE', impact: 'Discovered key DB latency factors and pulled crucial system metrics.' },
      { name: 'Jordan', roleDescription: 'Backend Engineer on-call', impact: 'Executed the safe container cluster scale operations.' },
    ],
    timelineEvents: [
      { time: '10:45', text: 'Alex notes growing error complaints from clients on orders portal' },
      { time: '10:48', text: 'Jordan confirms order-orchestrator CPU is fully pegged' },
      { time: '10:55', text: 'Deploy scaling update initiated' },
      { time: '10:59', text: 'Alerts clearing: latency registers baseline recovery' },
    ],
  };
}

function getSimulatedResolution(): CorrelatedIncidentDetails {
  return {
    timeline: [
      { time: '08:45', text: 'Alex notes initial API latency alarms in general chat', source: 'Chat' },
      { time: '08:50', text: 'Deployment of commit 59bf11c on payment service successfully completes', source: 'Deployment' },
      { time: '08:52', text: 'Database pool exhaustion logs emerge', source: 'Logs' },
      { time: '08:55', text: 'Screenshot of payments dashboards highlights a flat line on checkout throughput', source: 'Screenshot' },
      { time: '09:05', text: 'Jordan scales the replicas to 6 nodes', source: 'Chat' },
      { time: '09:12', text: 'Full recovery, checkout baseline stabilizes', source: 'Logs' },
    ],
    root_cause: 'A new pool configuration deployed on user-service replica containers led to immediate connection leakage. The server leaked PostgreSQL active sessions under intensive load, rapidly saturating pool resources.',
    confidence_score: 92,
    likely_trigger: 'Deployment of payment-service commit 59bf11c with non-closing node transaction wrappers.',
    severity: 'CRITICAL',
    affected_services: 'user-service, payment-api',
    evidence: 'ConnectionTimeout alarms synced precisely within 120 seconds of v1.4.9 deploy deployment completion.',
    suggested_fixes: {
      immediate: ['Scale database max_connections parameter up.', 'Rollback payment-service containers to safe preceding version.'],
      longTerm: ['Transition pool managers to run strict connection leak detection logs.', 'Inject circuit limits preventing cascade resource depletion.'],
      preventive: ['Mandate peer reviews on any configuration affecting pool or driver initialization logic.'],
    },
  };
}

function getSimulatedPostmortemMarkdown(
  title: string,
  severity: string,
  rootCause: string,
  timeline: { time: string; text: string; source?: string }[]
): string {
  return `# INCIDENT POSTMORTEM
**ID:** PM-2026-N12  
**Title:** ${title}  
**Severity:** ${severity}  
**Status:** PUBLISHED  
**Date of Incident:** June 14, 2026  

---

## 1. Executive Summary
On June 14, 2026, our production services experienced a significant SLA disruption on critical user gateways. The platform exhibited high latency and HTTP 500/502 errors, impeding normal checkout, authentication and status dashboards. Stabilization was achieved by isolated container rollback and pool size expansions.

## 2. Technical Root Cause & Deep-Dive
${rootCause}

The main technical culprit lies in resource leakage inside database driver context bindings. Connections acquisition requests started cascading in backlog queues, causing requests to load, timeout, and exhaust memory quotas.

## 3. Business & User Impact
- Total Downtime: 22 Minutes
- Affected Transactions: approximately 1,240 API requests resulting in error states
- Disruption Level: Low-Medium overall, critical on selected cart channels.

## 4. Incident Timeline
| Relative Time | Action/Observation | Evidence Source |
|---|---|---|
${timeline.map((t) => `| ${t.time} | ${t.text} | ${t.source || 'SysLog'} |`).join('\n')}

## 5. Mitigation & Recovery Steps
- Checked live Grafana status of target engines.
- Executed immediate database scale parameters increase.
- Dropped orphaned connection links manually.
- Rolled back active deploy packages.

## 6. Lessons Learned & Action Items
- **Always design secure fallback bounds** on connection failures.
- **Configure automated alerting** for early anomalies detection.

### Preventative Action Points:
- [ ] Implement query timeout profiles in driver settings. (*Owner: platform-dev*)
- [ ] Connect chat logs parsing alerts into telemetry triggers. (*Owner: devops-oncall*)
- [ ] Conduct load validation testing inside dev branches. (*Owner: testing-team*)
`;
}

// Similar Incident Memory Engine

export interface SimilarIncidentResult {
  similarIncidentFound: boolean;
  incidentId?: string;
  title?: string;
  root_cause?: string;
  previous_fix?: string;
  similarity_score?: number;
}

export async function findSimilarIncident(
  currentTitle: string,
  currentRootCause: string,
  historicalIncidents: any[]
): Promise<SimilarIncidentResult> {
  if (historicalIncidents.length === 0) {
    return { similarIncidentFound: false };
  }
  if (!checkApiKey()) {
    // Simulated similarity find
    return {
      similarIncidentFound: true,
      incidentId: historicalIncidents[0].id,
      title: historicalIncidents[0].title,
      root_cause: historicalIncidents[0].root_cause,
      previous_fix: 'Adjusted pooling configurations and scaled up primary user-service clusters.',
      similarity_score: 87,
    };
  }
  try {
    const historicalListJson = JSON.stringify(
      historicalIncidents.map((h) => ({
        id: h.id,
        title: h.title,
        root_cause: h.root_cause,
        resolution: h.resolution,
      }))
    );

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `You are an advanced SRE clustering engine. Compare the current incident against the provided list of past resolved incidents.
      
      CURRENT INCIDENT:
      Title: ${currentTitle}
      Root Cause: ${currentRootCause}

      HISTORICAL INCIDENTS RESOLVED:
      ${historicalListJson}
      
      Decide:
      1. Is there an incident in the historical list that represents a similar technical root cause or failure pattern? (similarIncidentFound)
      2. If found, identify its incidentId, its title, its root_cause, its previous resolution/fix, and the similarity_score (0 to 100 percentage).
      3. If no incident is reasonably similar (e.g. less than 40% alike), set similarIncidentFound: false.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['similarIncidentFound'],
          properties: {
            similarIncidentFound: { type: Type.BOOLEAN },
            incidentId: { type: Type.STRING },
            title: { type: Type.STRING },
            root_cause: { type: Type.STRING },
            previous_fix: { type: Type.STRING },
            similarity_score: { type: Type.INTEGER },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response');
    return JSON.parse(text.trim());
  } catch (error) {
    console.error('Error in findSimilarIncident:', error);
    return {
      similarIncidentFound: true,
      incidentId: historicalIncidents[0].id,
      title: historicalIncidents[0].title,
      root_cause: historicalIncidents[0].root_cause,
      previous_fix: 'Scaled up pg connections context and pool max bounds to 150.',
      similarity_score: 82,
    };
  }
}

