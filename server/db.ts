import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'warroom.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status TEXT NOT NULL,   -- 'OPEN', 'INVESTIGATING', 'RESOLVED'
    created_at TEXT NOT NULL,
    root_cause TEXT,        -- JSON or string
    suggested_fixes TEXT,   -- JSON or string
    timeline TEXT,          -- JSON string of list of events
    resolution TEXT,
    affected_services TEXT, -- Stored as comma-separated or JSON array
    evidence TEXT,
    confidence_score INTEGER,
    likely_trigger TEXT,
    deployment_info TEXT    -- Stored as JSON or string
  );

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- 'app', 'nginx', 'error', 'txt'
    created_at TEXT NOT NULL,
    FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    data_url TEXT NOT NULL, -- base64 string
    analysis TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS postmortems (
    id TEXT PRIMARY KEY,
    incident_id TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL, -- JSON or string
    created_at TEXT NOT NULL,
    FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS github_settings (
    id TEXT PRIMARY KEY, -- 'default'
    access_token TEXT,
    repo_owner TEXT,
    repo_name TEXT,
    authenticated_user TEXT,
    avatar_url TEXT,
    created_at TEXT
  );
`);

// Seed initial data if empty to show the "Similar Incident Memory" feature
const count = db.prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number };
if (count.count === 0) {
  // Pre-populate some historical resolved incidents for matching
  const historicalIncidents = [
    {
      id: 'INC-2026-610',
      title: 'Database connection limit exceeded on user-service',
      severity: 'CRITICAL',
      status: 'RESOLVED',
      created_at: '2026-06-10T08:00:00Z',
      root_cause: 'The database connection pool size was set to 10 on the user-service replica. During a peak traffic window, concurrent requests exhausted the idle connections, causing a backlog, high latency, and eventually 500 server errors on auth endpoints.',
      suggested_fixes: JSON.stringify({
        immediate: ['Scale database connection pool to 50 on auth-service and database clusters.', 'Kill idle leaked connections from zombie servers.'],
        longTerm: ['Implement circuit breakers on client-side requests.', 'Set idleConnectionTimeout to 10000ms to free dead connections proactively.'],
        preventive: ['Establish routine auto-alerting on pg_stat_activity connection count exceeding 80% limit.']
      }),
      timeline: JSON.stringify([
        { time: '08:00', text: 'Traffic spike detected, auth latency up' },
        { time: '08:05', text: 'Database alerts triggered for auth-db' },
        { time: '08:12', text: 'Connection pool exhausted on authenticated services' },
        { time: '08:30', text: 'Connections scaled successfully and pool size doubled in production configs' },
        { time: '08:45', text: 'Latency back to normal baseline, incident resolved' }
      ]),
      resolution: 'Resized PostgreSQL connection limit to 150. Decreased client pool timeout and updated configuration in user-service and authenticated services.',
      affected_services: 'user-service, auth-db, gateway-service',
      evidence: 'Logs showed: "ConnectionAcquisitionTimeoutException: Connection is not available, request timed out after 30000ms."',
      confidence_score: 95,
      likely_trigger: 'Traffic surge during Monday organic marketing launch',
      deployment_info: null
    },
    {
      id: 'INC-2026-612',
      title: 'Nginx 502 Bad Gateway due to upstream container crash',
      severity: 'HIGH',
      status: 'RESOLVED',
      created_at: '2026-06-12T14:10:00Z',
      root_cause: 'A new deployment chunk contained a null-pointer error on parsing user language context, causing the payments-service node process to crash repeatedly when parsing the accept-language headers of international checkout requests.',
      suggested_fixes: JSON.stringify({
        immediate: ['Roll back payment-service deployment back to v1.4.2.', 'Added language header null check safety guard locally.'],
        longTerm: ['Configure process managers such as pm2/kubernetes to automatically restart crashed node processes.', 'Write integration tests covering empty/null header schemas.'],
        preventive: ['Hook up automated regression testing on critical endpoints inside the deployment pipelines.']
      }),
      timeline: JSON.stringify([
        { time: '14:10', text: 'Payment service v1.4.3 deployment triggered' },
        { time: '14:12', text: '502 Bad Gateway spikes on /api/checkout' },
        { time: '14:20', text: 'Logs review identifies null language exception' },
        { time: '14:25', text: 'Deployment rolled back to stable payment-service v1.4.2' },
        { time: '14:32', text: 'Errors subsided, healthy checkouts resumed' }
      ]),
      resolution: 'Rolled back backend to commit sha `a20b7f` and redeployed payment-service. Authored strict fallback logic for accept-language parsing.',
      affected_services: 'payment-service, nginx-gateway',
      evidence: 'Nginx error log: "111: Connection refused while connecting to upstream: http://payments:8080/api/checkout"',
      confidence_score: 98,
      likely_trigger: 'Deploying code revision 89bf1dc to staging-prod',
      deployment_info: JSON.stringify({
        commitId: '89bf1dc',
        notes: 'Release international language localizations support.',
        timestamp: '2026-06-12T14:05:00Z'
      })
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO incidents (
      id, title, severity, status, created_at, root_cause, suggested_fixes,
      timeline, resolution, affected_services, evidence, confidence_score,
      likely_trigger, deployment_info
    ) VALUES (
      @id, @title, @severity, @status, @created_at, @root_cause, @suggested_fixes,
      @timeline, @resolution, @affected_services, @evidence, @confidence_score,
      @likely_trigger, @deployment_info
    )
  `);

  for (const inc of historicalIncidents) {
    insertStmt.run(inc);
  }
}

export default db;
