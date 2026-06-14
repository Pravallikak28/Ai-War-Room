export interface Incident {
  id: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  created_at: string;
  root_cause?: string;
  suggested_fixes?: string; // Stringified JSON
  timeline?: string;        // Stringified JSON
  resolution?: string;
  affected_services?: string;
  evidence?: string;
  confidence_score?: number;
  likely_trigger?: string;
  deployment_info?: string; // Stringified JSON
}

export interface Log {
  id: string;
  incident_id: string;
  content: string;
  type: 'app' | 'nginx' | 'error' | 'txt' | string;
  created_at: string;
}

export interface Screenshot {
  id: string;
  incident_id: string;
  data_url?: string;
  analysis?: string; // Stringified JSON
  created_at: string;
}

export interface TimelineEvent {
  time: string;
  text: string;
  source: 'Logs' | 'Chat' | 'Deployment' | 'Screenshot' | 'System' | string;
}

export interface SuggestedFixes {
  immediate: string[];
  longTerm: string[];
  preventive: string[];
}

export interface SimilarIncidentResult {
  similarIncidentFound: boolean;
  incidentId?: string;
  title?: string;
  root_cause?: string;
  previous_fix?: string;
  similarity_score?: number;
}

export interface DashboardStats {
  total: number;
  open: number;
  resolved: number;
  severities: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  recent: {
    id: string;
    title: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
    created_at: string;
  }[];
}
