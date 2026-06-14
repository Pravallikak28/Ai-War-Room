import React from 'react';
import {
  ArrowLeft,
  Terminal,
  Image as ImageIcon,
  MessageSquare,
  Sparkles,
  GitCommit,
  CheckCircle,
  HelpCircle,
  Clock,
  Briefcase,
  AlertOctagon,
  Copy,
  Download,
  Flame,
  Check,
  Send,
  User,
  History,
  TrendingDown,
  Info,
  Github,
  Link2
} from 'lucide-react';
import { Incident, Log, Screenshot, TimelineEvent, SuggestedFixes, SimilarIncidentResult } from '../types';

interface IncidentDetailViewProps {
  incidentId: string;
  onBack: () => void;
  onRefresh: () => void;
}

export default function IncidentDetailView({ incidentId, onBack, onRefresh }: IncidentDetailViewProps) {
  const [incident, setIncident] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // GitHub Integration States
  const [githubConnected, setGithubConnected] = React.useState(false);
  const [repoOwner, setRepoOwner] = React.useState('');
  const [repoName, setRepoName] = React.useState('');

  // GitHub Issue Creation states
  const [fileIssueOpen, setFileIssueOpen] = React.useState(false);
  const [issueTitle, setIssueTitle] = React.useState('');
  const [issueBody, setIssueBody] = React.useState('');
  const [creatingIssue, setCreatingIssue] = React.useState(false);
  const [issueSuccessUrl, setIssueSuccessUrl] = React.useState<string | null>(null);
  const [issueSuccessNum, setIssueSuccessNum] = React.useState<number | null>(null);
  const [issueError, setIssueError] = React.useState<string | null>(null);

  // GitHub Pull Request creation states
  const [selectedFixForPr, setSelectedFixForPr] = React.useState('');
  const [prFilePath, setPrFilePath] = React.useState('');
  const [prCodeContent, setPrCodeContent] = React.useState('');
  const [prDescription, setPrDescription] = React.useState('');
  const [prDeploying, setPrDeploying] = React.useState(false);
  const [prSuccessUrl, setPrSuccessUrl] = React.useState<string | null>(null);
  const [prSuccessNum, setPrSuccessNum] = React.useState<number | null>(null);
  const [prError, setPrError] = React.useState<string | null>(null);

  // Active tab inside the war room
  const [activeTab, setActiveTab] = React.useState<'diagnostics' | 'ingestion' | 'postmortem'>('diagnostics');

  // Input states
  const [logInput, setLogInput] = React.useState('');
  const [logType, setLogType] = React.useState('app');
  const [chatInput, setChatInput] = React.useState('');
  const [commitId, setCommitId] = React.useState('');
  const [deployNotes, setDeployNotes] = React.useState('');
  const [deployTimestamp, setDeployTimestamp] = React.useState('');
  
  // Image states
  const [dragActive, setDragActive] = React.useState(false);
  const [screenshotPreview, setScreenshotPreview] = React.useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = React.useState('image/png');

  // Dropped file logs states
  const [droppedLogContent, setDroppedLogContent] = React.useState<string | null>(null);
  const [droppedLogName, setDroppedLogName] = React.useState<string>('');
  const [droppedLogType, setDroppedLogType] = React.useState<string>('app');
  const [droppedFileType, setDroppedFileType] = React.useState<'image' | 'log' | null>(null);
  const [analyzingFileDrop, setAnalyzingFileDrop] = React.useState(false);

  // Interactive resolution
  const [resolutionInput, setResolutionInput] = React.useState('');
  const [showResolveForm, setShowResolveForm] = React.useState(false);

  // AI loading indicators
  const [analyzingLog, setAnalyzingLog] = React.useState(false);
  const [analyzingChat, setAnalyzingChat] = React.useState(false);
  const [analyzingScreenshot, setAnalyzingScreenshot] = React.useState(false);
  const [analyzingDeploy, setAnalyzingDeploy] = React.useState(false);
  const [generatingPostmortemValue, setGeneratingPostmortemValue] = React.useState(false);
  const [matchingMemory, setMatchingMemory] = React.useState(false);

  // Retrospective / Memory states
  const [similarMemory, setSimilarMemory] = React.useState<SimilarIncidentResult | null>(null);
  const [postmortemContent, setPostmortemContent] = React.useState<string | null>(null);

  // Fetch incident data
  const fetchIncidentDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (!res.ok) throw new Error('Unrecognized incident identifier or backend error');
      const data = await res.json();
      setIncident(data);

      // Extract existing postmortem if configured
      if (data.postmortem) {
        setPostmortemContent(data.postmortem);
      } else {
        setPostmortemContent(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchGithubSettings = async () => {
    try {
      const res = await fetch('/api/github/settings');
      if (res.ok) {
        const data = await res.json();
        setGithubConnected(data.connected);
        if (data.connected) {
          setRepoOwner(data.repo_owner);
          setRepoName(data.repo_name);
        }
      }
    } catch (e) {
      console.error('Error fetching github settings:', e);
    }
  };

  React.useEffect(() => {
    fetchIncidentDetails();
    fetchGithubSettings();
  }, [incidentId]);

  // Handle GitHub Issue submission
  const handleFileIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingIssue(true);
      setIssueError(null);
      const res = await fetch(`/api/incidents/${incidentId}/github-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTitle: issueTitle, customBody: issueBody }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to dispatch issue to GitHub API');
      }

      const data = await res.json();
      setIssueSuccessUrl(data.url);
      setIssueSuccessNum(data.number);
      
      // refresh status & timeline
      await fetchIncidentDetails();
      onRefresh();
    } catch (err: any) {
      setIssueError(err.message || 'Unknown integration error');
    } finally {
      setCreatingIssue(false);
    }
  };

  // Submit automatic hotfix PR
  const handleDeployPr = async () => {
    try {
      setPrDeploying(true);
      setPrError(null);
      const res = await fetch(`/api/incidents/${incidentId}/github-patch-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: prFilePath,
          patchContent: prCodeContent,
          fixDescription: prDescription || selectedFixForPr
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed creating Pull Request on repository');
      }

      const data = await res.json();
      setPrSuccessUrl(data.url);
      setPrSuccessNum(data.number);

      // Reset fields
      setSelectedFixForPr('');
      setPrFilePath('');
      setPrCodeContent('');
      setPrDescription('');

      // reload timeline
      await fetchIncidentDetails();
      onRefresh();
    } catch (err: any) {
      setPrError(err.message || 'Unknown network error');
    } finally {
      setPrDeploying(false);
    }
  };

  // Load similarity memories from SQLite
  const querySimilarIncidents = async () => {
    if (!incident) return;
    try {
      setMatchingMemory(true);
      const res = await fetch(`/api/incidents/${incidentId}/similar`, { method: 'POST' });
      if (!res.ok) throw new Error('Similarity match failed on API');
      const data = await res.json();
      setSimilarMemory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setMatchingMemory(false);
    }
  };

  // Log upload callback
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logInput.trim()) return;
    try {
      setAnalyzingLog(true);
      const res = await fetch(`/api/incidents/${incidentId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: logInput, type: logType }),
      });
      if (!res.ok) throw new Error('Failed log execution');
      setLogInput('');
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Log analysis failed: ${err.message}`);
    } finally {
      setAnalyzingLog(false);
    }
  };

  // Slack Chat upload callback
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      setAnalyzingChat(true);
      const res = await fetch(`/api/incidents/${incidentId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatLog: chatInput }),
      });
      if (!res.ok) throw new Error('Slack parsing failure');
      setChatInput('');
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Chat analysis failed: ${err.message}`);
    } finally {
      setAnalyzingChat(false);
    }
  };

  // Deployment metadata correlation
  const handleDeploymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitId.trim()) return;
    try {
      setAnalyzingDeploy(true);
      const res = await fetch(`/api/incidents/${incidentId}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commitId,
          notes: deployNotes,
          timestamp: deployTimestamp || new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Failed release mapping correlation');
      setCommitId('');
      setDeployNotes('');
      setDeployTimestamp('');
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Deployment correlation failed: ${err.message}`);
    } finally {
      setAnalyzingDeploy(false);
    }
  };

  // Resolve incident
  const handleResolveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: resolutionInput }),
      });
      if (!res.ok) throw new Error('Could not submit resolution details');
      setResolutionInput('');
      setShowResolveForm(false);
      await fetchIncidentDetails();
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Base64 converters and log readers for drag-and-drop / file selection
  const handleGenericFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processGenericFile(file);
  };

  const processGenericFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      setImageMimeType(file.type);
      reader.onload = () => {
        setScreenshotPreview(reader.result as string);
        setDroppedFileType('image');
        setDroppedLogContent(null);
        setDroppedLogName(file.name);
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setDroppedLogContent(text);
        setDroppedFileType('log');
        setScreenshotPreview(null);
        setDroppedLogName(file.name);
        
        // Auto-detect log type from filename
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('nginx')) {
          setDroppedLogType('nginx');
        } else if (lowerName.includes('error')) {
          setDroppedLogType('error');
        } else {
          setDroppedLogType('app');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDroppedScreenshotSubmit = async () => {
    if (!screenshotPreview) return;
    try {
      setAnalyzingFileDrop(true);
      const res = await fetch(`/api/incidents/${incidentId}/screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: screenshotPreview, mimeType: imageMimeType }),
      });
      if (!res.ok) throw new Error('Screenshot upload parsing failed');
      clearDropZone();
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Screenshot upload failed: ${err.message}`);
    } finally {
      setAnalyzingFileDrop(false);
    }
  };

  const handleDroppedLogSubmit = async () => {
    if (!droppedLogContent) return;
    try {
      setAnalyzingFileDrop(true);
      const res = await fetch(`/api/incidents/${incidentId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: droppedLogContent, type: droppedLogType }),
      });
      if (!res.ok) throw new Error('Failed log execution');
      clearDropZone();
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Log analysis failed: ${err.message}`);
    } finally {
      setAnalyzingFileDrop(false);
    }
  };

  const clearDropZone = () => {
    setScreenshotPreview(null);
    setDroppedLogContent(null);
    setDroppedLogName('');
    setDroppedFileType(null);
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processGenericFile(e.dataTransfer.files[0]);
    }
  };

  // Generate Postmortem document
  const handleGeneratePostmortem = async () => {
    try {
      setGeneratingPostmortemValue(true);
      const res = await fetch(`/api/incidents/${incidentId}/postmortem/generate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed postmortem creation via API');
      const data = await res.json();
      setPostmortemContent(data.markdown);
      await fetchIncidentDetails();
    } catch (err: any) {
      alert(`Failed postmortem generator: ${err.message}`);
    } finally {
      setGeneratingPostmortemValue(false);
    }
  };

  // Exporters
  const downloadPostmortemMarkdown = () => {
    if (!postmortemContent) return;
    const blob = new Blob([postmortemContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${incident?.id || 'INC'}_Postmortem.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyPostmortemClipboard = () => {
    if (!postmortemContent) return;
    navigator.clipboard.writeText(postmortemContent);
    alert('Copied Markdown report to clipboard!');
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <Clock size={36} className="text-red-400 mx-auto animate-spin" />
        <p className="text-slate-400 text-sm font-mono tracking-wider uppercase">Loading Outage Room telemetry...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="py-12 bg-dark-card border border-dark-border rounded-xl text-center p-6 space-y-4">
        <AlertOctagon size={40} className="text-red-500 mx-auto" />
        <h3 className="text-white font-bold font-display">Encountered Incident Load Issue</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">{error || 'Incident details coordinates are corrupted.'}</p>
        <button
          onClick={onBack}
          className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-4 py-2 rounded-lg font-mono"
        >
          &larr; Return to Dashboard
        </button>
      </div>
    );
  }

  // Parse structures safely
  let timeline: TimelineEvent[] = [];
  try {
    timeline = JSON.parse(incident.timeline || '[]');
  } catch (e) {
    timeline = [];
  }

  let fixes: SuggestedFixes = { immediate: [], longTerm: [], preventive: [] };
  try {
    fixes = JSON.parse(incident.suggested_fixes || '{"immediate":[],"longTerm":[],"preventive":[]}');
  } catch (e) {
    fixes = { immediate: [], longTerm: [], preventive: [] };
  }

  // Timeline source color identifiers
  const sourceColors: Record<string, string> = {
    Logs: 'bg-purple-600 border-purple-500 text-white',
    Chat: 'bg-sky-600 border-sky-500 text-white',
    Deployment: 'bg-amber-600 border-amber-500 text-white',
    Screenshot: 'bg-blue-600 border-blue-500 text-white',
    System: 'bg-slate-700 border-slate-600 text-white',
  };

  const severityColors: Record<string, string> = {
    CRITICAL: 'text-red-500 bg-red-500/10 border-red-500/20',
    HIGH: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    MEDIUM: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    LOW: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  };

  return (
    <div className="space-y-6">
      {/* Return Head Links */}
      <div className="flex items-center justify-between">
        <button
          id="btn-back-to-dashboard"
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold uppercase select-none cursor-pointer"
        >
          <ArrowLeft size={12} /> Back to Command Console
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-emerald-400 font-bold flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            SYS_ROOM: CONNECTED
          </span>
        </div>
      </div>

      {/* Outage Room Title Header Banner */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded p-6 shadow-xs relative overflow-hidden">
        <div className="absolute right-4 top-2 opacity-15 font-mono text-4xl select-none text-red-500/30 font-extrabold pointer-events-none">
          {incident.id}
        </div>
        
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase font-bold text-red-400 px-2 py-0.5 rounded bg-red-950/30 border border-red-900/40">
              {incident.id}
            </span>
            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${severityColors[incident.severity]}`}>
              {incident.severity}
            </span>
            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${
              incident.status === 'RESOLVED'
                ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                : 'text-yellow-500 bg-yellow-950/20 border-yellow-905/30'
            }`}>
              {incident.status}
            </span>
            <span className="text-xs font-mono text-zinc-500 flex items-center gap-1">
              <Clock size={12} fill="none" /> Declared {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(incident.created_at).toLocaleDateString()}
            </span>
          </div>

          <h2 className="text-lg font-bold font-mono tracking-tight text-zinc-100 max-w-4xl leading-tight">
            {incident.title}
          </h2>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {incident.status !== 'RESOLVED' && (
              <button
                onClick={() => setShowResolveForm(!showResolveForm)}
                className="bg-emerald-800 hover:bg-emerald-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border border-emerald-700 hover:border-emerald-600 flex items-center gap-1.5 cursor-pointer uppercase transition-all"
              >
                <CheckCircle size={12} /> MARK AS RESOLVED / RESTORED
              </button>
            )}
            
            <button
              onClick={querySimilarIncidents}
              disabled={matchingMemory}
              className="bg-zinc-800 hover:bg-zinc-700 text-yellow-500 hover:text-white font-mono text-xs px-4 py-2 rounded border border-zinc-700 hover:border-zinc-600 flex items-center gap-1.5 cursor-pointer uppercase transition-all"
            >
              <History size={12} />
              {matchingMemory ? 'Matching clusters...' : 'Deduce similar histories'}
            </button>

            <button
              id="btn-file-github-issue"
              onClick={() => {
                if (!githubConnected) {
                  alert('GitHub is not linked. Please connect a repository in System Parameters > GitHub Integration to file tracking tickets.');
                  return;
                }
                setIssueTitle(`[SRE OUTAGE ${incident.severity}] ${incident.title} (${incident.id})`);
                let bodyText = `## Incident SRE Report\n\n`;
                bodyText += `**Incident ID:** \`${incident.id}\`\n`;
                bodyText += `**Severity:** \`${incident.severity}\`\n`;
                bodyText += `**Current Status:** \`${incident.status}\`\n`;
                bodyText += `**Establishment Time:** ${new Date(incident.created_at).toLocaleString()}\n\n`;
                
                if (incident.root_cause) {
                  bodyText += `### Root Cause Analysis\n${incident.root_cause}\n\n`;
                }
                if (incident.likely_trigger) {
                  bodyText += `**Likely Trigger:** ${incident.likely_trigger}\n\n`;
                }
                if (incident.evidence) {
                  bodyText += `### Supporting Evidence / Error Trace\n\`\`\`\n${incident.evidence}\n\`\`\`\n\n`;
                }
                
                let parsedT = [];
                try {
                  parsedT = JSON.parse(incident.timeline || '[]');
                } catch(e) {}
                if (parsedT.length > 0) {
                  bodyText += `### SRE Chronological Timeline\n`;
                  parsedT.forEach((t: any) => {
                    bodyText += `- \`[${t.time}]\` ${t.text} (*Source: ${t.source}*)\n`;
                  });
                }
                
                setIssueBody(bodyText);
                setIssueSuccessUrl(null);
                setIssueSuccessNum(null);
                setIssueError(null);
                setFileIssueOpen(true);
              }}
              className="bg-zinc-800 hover:bg-zinc-750 text-white hover:text-red-400 font-mono text-xs px-4 py-2 rounded border border-zinc-700 hover:border-zinc-600 flex items-center gap-1.5 cursor-pointer uppercase transition-all"
            >
              <Github size={12} />
              File GitHub Issue
            </button>
          </div>

          {/* Inline Resolution form component */}
          {showResolveForm && (
            <form onSubmit={handleResolveIncident} className="bg-zinc-950 border border-emerald-800/30 rounded p-4 mt-4 space-y-3">
              <h4 className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest">
                Post Outage SLA Mitigation Narrative
              </h4>
              <textarea
                required
                value={resolutionInput}
                onChange={(e) => setResolutionInput(e.target.value)}
                placeholder="Specify hotfix commit sha, rollback instructions, DNS configuration changes or cluster scaling tweaks..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-600 focus:outline-none rounded p-3 text-xs placeholder-zinc-700 text-zinc-300 font-mono h-20"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="bg-emerald-800 hover:bg-emerald-700 text-white font-mono font-bold text-xs py-1.5 px-4 rounded border border-emerald-700 cursor-pointer"
                >
                  Confirm Incident Recovery Closeout
                </button>
                <button
                  type="button"
                  onClick={() => setShowResolveForm(false)}
                  className="text-zinc-550 text-xs font-mono hover:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {incident.resolution && (
            <div className="bg-emerald-950/15 border border-emerald-900/30 rounded p-4 mt-2">
              <div className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase font-bold">
                RESOLUTION PATHWAY:
              </div>
              <p className="text-xs font-mono text-zinc-350 mt-1">{incident.resolution}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs list navigation with technical underlays */}
      <div className="flex border-b border-zinc-800 gap-6 font-mono text-xs">
        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`pb-2.5 font-bold uppercase cursor-pointer relative ${
            activeTab === 'diagnostics' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          AI Diagnostics & Root Cause
          {activeTab === 'diagnostics' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 shadow-sm" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('ingestion')}
          className={`pb-2.5 font-bold uppercase cursor-pointer relative flex items-center gap-1.5 ${
            activeTab === 'ingestion' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Troubleshooting Feeds Ingestion
          <span className="text-[9px] bg-red-950/40 border border-red-900/30 text-red-400 rounded px-1.5 py-0.2 animate-pulse font-mono">
            LIVE ANALYZER
          </span>
          {activeTab === 'ingestion' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 shadow-sm" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('postmortem')}
          className={`pb-2.5 font-bold uppercase cursor-pointer relative ${
            activeTab === 'postmortem' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Outage Postmortem Draft
          {activeTab === 'postmortem' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 shadow-sm" />
          )}
        </button>
      </div>

      {/* TAB CONTENT: AI DIAGNOSTICS */}
      {activeTab === 'diagnostics' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Primary Root Cause panel */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-[10px] font-bold font-mono text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase">
                  <Flame size={14} className="text-red-500 animate-pulse" /> /// ROOT CAUSE DIAGNOSIS
                </h3>
                {incident.confidence_score && (
                  <span className="font-mono text-[10px] text-yellow-500 bg-yellow-950/40 border border-yellow-900/35 px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                    <Sparkles size={10} /> {incident.confidence_score}% CONFIDENCE
                  </span>
                )}
              </div>

              {incident.root_cause ? (
                <div className="space-y-4 font-mono text-zinc-300 text-xs">
                  <p className="leading-relaxed whitespace-pre-line border-l border-zinc-700 pl-3 py-1 bg-zinc-950/20">{incident.root_cause}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded p-3.5 space-y-1">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold block">
                        Likely Root Trigger
                      </span>
                      <p className="text-xs font-semibold text-zinc-200 leading-normal">
                        {incident.likely_trigger || 'Awaiting additional telemetry correlation'}
                      </p>
                    </div>

                    <div className="bg-zinc-950/80 border border-zinc-800 rounded p-3.5 space-y-1">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold block">
                        Impacted Services
                      </span>
                      <p className="text-xs font-semibold text-zinc-200 leading-normal">
                        {incident.affected_services || 'unclassified-components'}
                      </p>
                    </div>
                  </div>

                  {incident.evidence && (
                    <div className="bg-zinc-950 border border-zinc-805 rounded p-3.5">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mb-1 font-bold">
                        SRE TELEMETRY EVIDENCE
                      </span>
                      <p className="text-[11px] font-mono text-rose-400 whitespace-pre-wrap leading-relaxed">{incident.evidence}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Terminal size={24} className="text-zinc-700 mx-auto" />
                  <p className="text-zinc-400 text-xs font-mono">
                    Root Cause analysis is not available yet.
                  </p>
                  <p className="text-[10px] text-zinc-500 max-w-sm mx-auto font-mono leading-relaxed">
                    Upload telemetry application logs or sync a deployment revision inside the{' '}
                    <span className="text-red-400 font-bold uppercase">Troubleshooting</span> tab to automatically trigger Gemini.
                  </p>
                </div>
              )}
            </div>

            {/* Suggested Fixes panel */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded p-5 space-y-4">
              <h3 className="text-[10px] font-bold font-mono text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-3">
                /// INTELLIGENT MITIGATION REMEDIES
              </h3>

              {fixes.immediate.length > 0 || fixes.longTerm.length > 0 || fixes.preventive.length > 0 ? (
                <div className="space-y-4">
                  {fixes.immediate.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[9px] font-mono text-red-500 tracking-wider font-bold uppercase">
                        Immediate Actions
                      </div>
                      <div className="space-y-2">
                        {fixes.immediate.map((fixStr, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-red-950/10 p-2.5 rounded border border-red-900/20">
                            <input type="checkbox" className="mt-0.5 rounded border-zinc-700 text-red-650 focus:ring-red-500 cursor-pointer" id={`fix-imm-${idx}`} />
                            <label htmlFor={`fix-imm-${idx}`} className="text-xs text-zinc-350 font-mono cursor-pointer select-none">
                              {fixStr}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fixes.longTerm.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="text-[9px] font-mono text-yellow-500 tracking-wider font-bold uppercase">
                        Long-term Structural Fixes
                      </div>
                      <div className="space-y-2">
                        {fixes.longTerm.map((fixStr, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-yellow-950/10 p-2.5 rounded border border-yellow-900/20">
                            <input type="checkbox" className="mt-0.5 rounded border-zinc-700 text-yellow-600 focus:ring-yellow-500 cursor-pointer" id={`fix-lt-${idx}`} />
                            <label htmlFor={`fix-lt-${idx}`} className="text-xs text-zinc-350 font-mono cursor-pointer select-none">
                              {fixStr}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fixes.preventive.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="text-[9px] font-mono text-emerald-500 tracking-wider font-bold uppercase">
                        Systemic Preventive Guardians
                      </div>
                      <div className="space-y-2">
                        {fixes.preventive.map((fixStr, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-emerald-950/10 p-2.5 rounded border border-emerald-900/20">
                            <input type="checkbox" className="mt-0.5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer" id={`fix-prv-${idx}`} />
                            <label htmlFor={`fix-prv-${idx}`} className="text-xs text-zinc-350 font-mono cursor-pointer select-none">
                              {fixStr}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-zinc-650 text-xs font-mono">
                  No automated remedies loaded. Try ingestion analysis to generate mitigation checklists.
                </div>
              )}

              {/* GH MITIGATION DISPATCHER */}
              <div className="bg-zinc-950 border border-zinc-850 p-4 rounded mt-4 space-y-3 font-mono">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5">
                    <Github size={12} className="text-zinc-200" />
                    GH Hotfix Dispatcher
                  </span>
                  {githubConnected ? (
                    <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/20 border border-emerald-900/30 px-1.5 py-0.5 rounded">
                      ACTIVE | {repoOwner}/{repoName}
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-500 font-bold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                      OFFLINE
                    </span>
                  )}
                </div>

                {prSuccessUrl && (
                  <div className="bg-emerald-950/25 border border-emerald-900/40 p-2.5 rounded text-[11px] text-emerald-400 leading-relaxed">
                    ✓ Hotfix PR successfully deployed!{' '}
                    <a
                      href={prSuccessUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-bold text-emerald-300 hover:text-white cursor-pointer"
                    >
                      View Pull Request #{prSuccessNum} on GitHub
                    </a>
                  </div>
                )}

                {prError && (
                  <div className="bg-red-950/25 border border-red-900/40 p-2.5 rounded text-[11px] text-red-400 leading-relaxed">
                    ⚠️ Error: {prError}
                  </div>
                )}

                {githubConnected ? (
                  <div className="space-y-3 text-xs leading-none">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 leading-normal">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold block">CHOOSE REMEDIATION PROCESS</label>
                        <select
                          value={selectedFixForPr}
                          onChange={(e) => {
                            setSelectedFixForPr(e.target.value);
                            setPrDescription(`Addressing SRE war room suggestion: ${e.target.value}`);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500 font-mono"
                        >
                          <option value="">-- Select template action --</option>
                          {fixes.immediate.map((fix, idx) => (
                            <option key={`imm-${idx}`} value={fix}>Immediate: {fix.slice(0, 50)}...</option>
                          ))}
                          {fixes.longTerm.map((fix, idx) => (
                            <option key={`lt-${idx}`} value={fix}>Long-term: {fix.slice(0, 50)}...</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold block">TARGET CODE FILE PATH</label>
                        <input
                          type="text"
                          value={prFilePath}
                          onChange={(e) => setPrFilePath(e.target.value)}
                          placeholder="e.g. server.ts or src/utils/pool.ts"
                          className="w-full bg-zinc-950 border border-zinc-805 text-zinc-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 leading-normal">
                      <label className="text-[10px] text-zinc-500 font-bold block">REVISION COMMIT SUMMARY (PR DESC)</label>
                      <input
                        type="text"
                        value={prDescription}
                        onChange={(e) => setPrDescription(e.target.value)}
                        placeholder="e.g. fix: mitigate database connection pooling leak"
                        className="w-full bg-zinc-950 border border-zinc-805 text-zinc-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1 leading-normal">
                      <label className="text-[10px] text-zinc-500 font-bold block">PROPOSED HOTFIX PATCH (CODE BUFFERS)</label>
                      <textarea
                        value={prCodeContent}
                        onChange={(e) => setPrCodeContent(e.target.value)}
                        placeholder={`// Write complete replacement file code here...\n\nexport function healthcheck() {\n  return { status: "OK" };\n}`}
                        className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded p-2.5 text-xs focus:outline-none focus:border-red-500 h-28 font-mono leading-normal"
                      />
                    </div>

                    <button
                      type="button"
                      id="btn-deploy-hotfix-pr"
                      onClick={handleDeployPr}
                      disabled={prDeploying || !prFilePath || !prCodeContent || !selectedFixForPr}
                      className="w-full bg-red-950/30 hover:bg-red-900/40 disabled:opacity-40 border border-red-800/80 hover:border-red-550 text-red-400 font-bold py-2 rounded text-center transition-all cursor-pointer uppercase text-[10px] shadow glow-red"
                    >
                      {prDeploying ? 'Branching & Injecting PR branch...' : 'Deploy Automatic Hotfix PR'}
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-500 leading-normal flex items-center justify-between">
                    <span>Activate GitHub configurations in system settings to dispatch patches.</span>
                    <span className="text-red-500 font-bold font-mono">MUTATION_LOCK</span>
                  </div>
                )}
              </div>
            </div>

            {/* Similar Incident Memory Panel */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded p-5 space-y-4">
              <h3 className="text-[10px] font-bold font-mono text-zinc-400 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-800 pb-3">
                <History size={14} className="text-yellow-500" /> /// SIMILAR INCIDENT HISTORICAL COUNTERPARTS
              </h3>

              {similarMemory ? (
                similarMemory.similarIncidentFound ? (
                  <div className="bg-yellow-950/10 border border-yellow-900/20 rounded p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="font-mono text-[10px] text-yellow-500 font-bold bg-yellow-950/40 border border-yellow-900/30 px-2 py-0.5 rounded">
                        {similarMemory.incidentId} Match Detected
                      </span>
                      <span className="text-xs font-mono font-bold text-yellow-500">
                        {similarMemory.similarity_score}% Match Confidence
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">
                        Matching Past Event Title
                      </span>
                      <span className="text-xs font-bold text-zinc-200 font-mono leading-normal block">
                        {similarMemory.title}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">
                        Historical Root Cause Details
                      </span>
                      <p className="text-xs text-zinc-400 leading-normal font-mono whitespace-pre-wrap">
                        {similarMemory.root_cause}
                      </p>
                    </div>

                    <div className="bg-emerald-950/10 border border-emerald-920/20 rounded p-2.5">
                      <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest block font-bold mb-0.5">
                        Historical Mitigation / Recovery Fix Applied
                      </span>
                      <p className="text-xs text-zinc-350 leading-normal font-mono">
                        {similarMemory.previous_fix}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-950/50 border border-zinc-900 rounded text-center text-zinc-500 text-xs font-mono">
                    Clustering engine checked resolved databases. No historically identical outages mapped above the 40% threshold.
                  </div>
                )
              ) : (
                <div className="p-4 bg-zinc-950/50 border border-zinc-900 rounded text-center text-zinc-650 text-xs font-mono">
                  Trigger SRE clustering to identify historical counterparts. Click "Deduce similar histories" above.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR: UNIFIED INTERACTIVE TIMELINE */}
          <div className="space-y-6">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded p-5 space-y-4 shadow-xs">
              <h3 className="text-[10px] font-bold font-mono text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase border-b border-zinc-800 pb-3">
                <Clock size={14} className="text-red-500 animate-pulse" /> /// FORENSIC TIMELINE
              </h3>

              {timeline.length > 0 ? (
                <div className="relative pl-6 border-l border-zinc-800 space-y-5 py-2 font-mono">
                  {timeline.map((evt, idx) => (
                    <div key={idx} className="relative space-y-1 group">
                      {/* Circle node indicator */}
                      <div
                        className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border flex items-center justify-center text-[8px] font-bold ${
                          sourceColors[evt.source] || 'bg-zinc-850 border-zinc-750 text-zinc-400'
                        }`}
                        title={evt.source}
                      >
                        {evt.source ? evt.source[0] : 'S'}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-400 font-bold bg-red-950/30 border border-red-900/30 px-1.5 py-0.2 rounded">
                          {evt.time}
                        </span>
                        {evt.source && (
                          <span className="text-[9px] text-zinc-550 uppercase tracking-widest font-bold">
                            [{evt.source}]
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                        {evt.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-600 text-xs font-mono leading-relaxed">
                  Forensic timeline is pristine. Upload log events or build commit triggers to populate the database.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: INGESTION PIPELINES */}
      {activeTab === 'ingestion' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono">
          {/* UPLOAD & PASTE LOG DETAILS */}
          <div className="bg-zinc-900/30 border border-zinc-805 rounded p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-[10px] font-bold text-zinc-300 tracking-wider flex items-center gap-1.5 uppercase">
                <Terminal size={14} className="text-purple-400" /> PIPE TELEMETRY LOGS
              </h3>
              <span className="text-[9px] text-purple-400 font-bold bg-purple-950/40 border border-purple-900/30 px-2 py-0.5 rounded">
                PROT: app, nginx, error, syslog, text
              </span>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Log Type:</span>
                <div className="flex items-center gap-2">
                  {['app', 'nginx', 'error', 'txt'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLogType(t)}
                      className={`text-[9px] font-mono py-1 px-2.5 rounded border uppercase font-bold cursor-pointer transition-all ${
                        logType === t
                          ? 'bg-purple-850 border-purple-700 text-white shadow'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                required
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                placeholder="Paste stack traces, DB pool exhaustions, microservice response failures..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-600 focus:outline-none rounded p-4 h-64 text-xs font-mono text-zinc-300 placeholder-zinc-700 leading-normal"
              />

              <button
                type="submit"
                disabled={analyzingLog}
                className="w-full bg-purple-900 hover:bg-purple-800 disabled:bg-purple-950 text-white font-bold text-xs py-2.5 px-4 rounded border border-purple-750 cursor-pointer uppercase flex items-center justify-center gap-2"
              >
                {analyzingLog ? (
                  <>
                    <Clock size={12} className="animate-spin" /> RUNNING GEMINI PARSER LOGS REVIEW...
                  </>
                ) : (
                  <>
                    <Send size={12} /> EVALUATE SYSTEM OUTAGE LOGS
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="space-y-6">
            {/* UNIFIED SRE TELEMETRY DRAG-DROP PORTAL */}
            <div className="bg-zinc-900/30 border border-zinc-805 rounded p-5 space-y-4 shadow-sm">
              <h3 className="text-[10px] font-bold text-zinc-305 tracking-wider flex items-center gap-1.5 uppercase border-b border-zinc-805 pb-3">
                <ImageIcon size={14} className="text-blue-400" /> MULTIMODAL DRAG-DROP INGESTION
              </h3>

              <div className="space-y-4">
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border border-dashed rounded p-6 text-center transition-all relative ${
                    dragActive
                      ? 'border-blue-550 bg-blue-950/20'
                      : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*,text/*,.log,.txt,.json,.syslog"
                    id="generic-file-input"
                    onChange={handleGenericFileChange}
                    className="hidden"
                  />
                  
                  {droppedFileType === 'image' && screenshotPreview ? (
                    <div className="space-y-3">
                      <div className="text-[10px] text-zinc-400 font-mono">
                        DETECTED SCREENSHOT: <strong className="text-blue-400">{droppedLogName}</strong>
                      </div>
                      <img
                        src={screenshotPreview}
                        alt="Preview metadata"
                        className="max-h-40 mx-auto rounded border border-zinc-800 object-contain"
                      />
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={handleDroppedScreenshotSubmit}
                          disabled={analyzingFileDrop}
                          className="bg-blue-800 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded border border-blue-600 cursor-pointer uppercase font-mono disabled:opacity-50"
                        >
                          {analyzingFileDrop ? 'Analyzing Screen...' : 'Upload & Analyze Screenshot'}
                        </button>
                        <button
                          onClick={clearDropZone}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-1.5 px-4 rounded border border-zinc-750 cursor-pointer font-mono"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : droppedFileType === 'log' && droppedLogContent ? (
                    <div className="space-y-3 text-left">
                      <div className="text-[10px] text-zinc-400 font-mono text-center">
                        DETECTED LOG FILE: <strong className="text-purple-400">{droppedLogName}</strong>
                      </div>
                      
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-350 max-h-40 overflow-y-auto whitespace-pre-wrap leading-normal">
                        {droppedLogContent.substring(0, 800) + (droppedLogContent.length > 800 ? '\n... [TRUNCATED FOR PREVIEW]' : '')}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 justify-center py-1">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Log Protocol Type:</span>
                        <div className="flex items-center gap-1.5">
                          {['app', 'nginx', 'error', 'txt'].map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setDroppedLogType(t)}
                              className={`text-[8px] font-mono py-0.5 px-2 rounded border uppercase font-bold cursor-pointer transition-all ${
                                droppedLogType === t
                                  ? 'bg-purple-850 border-purple-700 text-white'
                                  : 'bg-zinc-950 border-zinc-805 text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          onClick={handleDroppedLogSubmit}
                          disabled={analyzingFileDrop}
                          className="bg-purple-900 hover:bg-purple-800 disabled:bg-purple-950 text-white text-xs font-bold py-1.5 px-4 rounded border border-purple-750 cursor-pointer uppercase font-mono disabled:opacity-50"
                        >
                          {analyzingFileDrop ? 'Parsing Log File...' : 'Upload & run Log review'}
                        </button>
                        <button
                          onClick={clearDropZone}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-1.5 px-4 rounded border border-zinc-750 cursor-pointer font-mono"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="generic-file-input" className="cursor-pointer space-y-2 block">
                      <ImageIcon size={24} className="text-zinc-600 mx-auto" />
                      <p className="text-xs text-zinc-400 font-sans">
                        Drag & Drop files (log buffers, metrics, screenshots, or code outputs) here
                      </p>
                      <p className="text-[10px] text-zinc-550 lowercase font-mono">
                        Supports screenshot image OR log text (.log, .txt, .json)
                      </p>
                      <p className="text-[9px] text-zinc-600 lowercase font-mono pb-1">
                        Or click to browse files
                      </p>
                    </label>
                  )}
                </div>

                {/* Extracted list of processed screenshots */}
                {incident.screenshots && incident.screenshots.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">
                      Parsed Telemetry Screens ({incident.screenshots.length}):
                    </span>
                    <div className="space-y-2 max-h-44 overflow-y-auto">
                      {incident.screenshots.map((scr: any, idx: number) => {
                        let parsedAnalysis = { summary: '', relevanceToIncident: '' };
                        try {
                          parsedAnalysis = JSON.parse(scr.analysis || '{}');
                        } catch (e) {
                          parsedAnalysis = { summary: scr.analysis, relevanceToIncident: '' };
                        }

                        return (
                          <div key={scr.id} className="p-3 bg-blue-950/10 border border-blue-900/20 rounded space-y-1">
                            <span className="font-mono text-[9px] text-blue-400 font-bold">
                              SCREENSHOT #{idx + 1} ({scr.id})
                            </span>
                            <p className="text-xs text-zinc-300">
                              {parsedAnalysis.summary || 'Parsing completed.'}
                            </p>
                            {parsedAnalysis.relevanceToIncident && (
                              <p className="text-[10px] text-zinc-500 font-sans italic">
                                SRE Relevance: {parsedAnalysis.relevanceToIncident}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* DEPLOYMENT ANOMALOUS CORRELATION FORM */}
            <div className="bg-zinc-900/30 border border-zinc-805 rounded p-5 space-y-4">
              <h3 className="text-[10px] font-bold text-zinc-300 tracking-wider flex items-center gap-1.5 uppercase border-b border-zinc-805 pb-3">
                <GitCommit size={14} className="text-amber-500 animate-pulse" /> CORRELATE RECENT RELEASE DEPLOYMENTS
              </h3>

              <form onSubmit={handleDeploymentSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">COMMIT SHA</span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. 59bf11c"
                      value={commitId}
                      onChange={(e) => setCommitId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 focus:outline-none rounded p-2 text-xs text-zinc-300"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">OUTAGE DELAY TIMESTAMP</span>
                    <input
                      type="text"
                      placeholder="e.g. 14:10"
                      value={deployTimestamp}
                      onChange={(e) => setDeployTimestamp(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 focus:outline-none rounded p-2 text-xs text-zinc-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold">CHANGELOG COMMITS AND DETAILS</span>
                  <input
                    required
                    type="text"
                    placeholder="e.g. enabled accept-language support, bump elastic connection limits..."
                    value={deployNotes}
                    onChange={(e) => setDeployNotes(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 focus:outline-none rounded p-2.5 text-xs text-zinc-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={analyzingDeploy}
                  className="w-full bg-amber-800 hover:bg-amber-700 disabled:bg-amber-950 text-white font-bold text-xs py-2.5 px-4 rounded border border-amber-600 hover:border-amber-500 cursor-pointer uppercase text-center"
                >
                  {analyzingDeploy ? 'RUNNING CROSS TELEMETRY DIAGNOSIS...' : 'MELD DEPLOY TO GRAPH TIMELINE'}
                </button>
              </form>
            </div>

            {/* SLACK CHAT THREAD INGESTION */}
            <div className="bg-zinc-900/30 border border-zinc-805 rounded p-5 space-y-4">
              <h3 className="text-[10px] font-bold text-zinc-300 tracking-wider flex items-center gap-1.5 uppercase border-b border-zinc-805 pb-3">
                <MessageSquare size={14} className="text-sky-400" /> PASTE WAR ROOM CHAT LOGS
              </h3>

              <form onSubmit={handleChatSubmit} className="space-y-3">
                <textarea
                  required
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Paste conversation blocks directly:&#10;Alice: Seems auth-service replica memory hit limit.&#10;John: Scaling up to 3 units..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-sky-500 focus:outline-none rounded p-4 h-40 text-xs font-mono text-zinc-300 placeholder-zinc-700"
                />

                <button
                  type="submit"
                  disabled={analyzingChat}
                  className="w-full bg-sky-800 hover:bg-sky-700 disabled:bg-sky-950 text-white font-bold text-xs py-2.5 px-4 rounded border border-sky-600 hover:border-sky-500 cursor-pointer uppercase text-center font-mono"
                >
                  {analyzingChat ? 'EVALUATING TEAM DISCUSSIONS...' : 'CORRELATE WAR TEAM CHAT ACTIONS'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: POSTMORTEM REPORT DRAFT */}
      {activeTab === 'postmortem' && (
        <div className="bg-zinc-900/30 border border-zinc-805 rounded p-5 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-xs font-bold font-mono text-zinc-350 tracking-wider flex items-center gap-1.5 uppercase">
                /// OUTAGE POSTMORTEM REPORT COMPILER
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wide">
                pagerduty & netflix incident reporting models formatted via gemini.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGeneratePostmortem}
                disabled={generatingPostmortemValue}
                className="bg-red-900 hover:bg-red-800 disabled:bg-red-950 text-white text-xs font-mono font-bold px-4 py-2 rounded border border-red-750 flex items-center gap-1.5 cursor-pointer uppercase transition-all"
              >
                <Sparkles size={12} />
                {generatingPostmortemValue ? 'Architecting...' : postmortemContent ? 'REGENERATE REPORT' : 'COMPILE POSTMORTEM'}
              </button>

              {postmortemContent && (
                <>
                  <button
                    onClick={copyPostmortemClipboard}
                    className="bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-mono px-3 py-2 rounded border border-zinc-750 flex items-center gap-1 cursor-pointer select-none"
                  >
                    <Copy size={12} /> Copy MD
                  </button>
                  <button
                    onClick={downloadPostmortemMarkdown}
                    className="bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-mono px-3 py-2 rounded border border-zinc-750 flex items-center gap-1 cursor-pointer select-none"
                  >
                    <Download size={12} /> Download
                  </button>
                </>
              )}
            </div>
          </div>

          {postmortemContent ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start font-mono text-xs">
              {/* Output markdown visualizer */}
              <div className="bg-zinc-950 border border-zinc-850 rounded p-6 shadow-inner text-zinc-300 max-w-none text-xs overflow-y-auto h-[600px] leading-relaxed">
                <div className="text-[9px] font-mono text-zinc-550 uppercase tracking-widest block mb-4 pb-2 border-b border-zinc-850 text-center font-bold">
                  /// SLA OUTAGE REPORT RENDER VIEWER
                </div>
                <div className="whitespace-pre-wrap font-mono">{postmortemContent}</div>
              </div>

              {/* Raw editable terminal source */}
              <div className="space-y-4">
                <div className="bg-zinc-950 border border-zinc-850 rounded p-5 space-y-2">
                  <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider font-bold">
                    /// LIVE MARKDOWN EDITABLE BUFFERS
                  </div>
                  <textarea
                    value={postmortemContent}
                    onChange={(e) => setPostmortemContent(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 focus:border-zinc-700 focus:outline-none rounded p-4 h-[500px] text-xs font-mono text-zinc-300 leading-normal"
                  />
                  <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-tight">
                    * changes are stored dynamically. push contents to upstream slack, pagerduty, or jira incident logs.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center max-w-md mx-auto space-y-4 font-mono">
              <Sparkles size={28} className="text-red-500 mx-auto animate-pulse" />
              <h3 className="text-zinc-200 font-bold text-sm uppercase">Awaiting Postmortem Synthesis</h3>
              <p className="text-zinc-500 text-xs leading-relaxed font-sans">
                Feeds the unified chronologic SRE timeline logs, diagnostics indicators, and checklists directly to Gemini. This compiles a perfectly formatted Markdown retrospective.
              </p>
              <button
                id="btn-trigger-compile-postm"
                onClick={handleGeneratePostmortem}
                disabled={generatingPostmortemValue}
                className="bg-red-900 hover:bg-red-800 disabled:bg-red-950 text-white text-xs font-bold px-5 py-2.5 rounded border border-red-750 inline-flex items-center gap-1.5 cursor-pointer uppercase font-mono"
              >
                <Sparkles size={12} />
                {generatingPostmortemValue ? 'Synthesizing PDF/MD Report...' : 'GENERATE POSTMORTEM'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* FILE GITHUB ISSUE MODAL OVERLAY */}
      {fileIssueOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-[110] p-4 font-mono text-xs">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-lg p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Github size={16} className="text-red-500" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  File Incident Tracking Issue on GitHub
                </h3>
              </div>
              <span className="text-[10px] text-zinc-500">
                Target: {repoOwner}/{repoName}
              </span>
            </div>

            {issueSuccessUrl ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-950/40 text-emerald-400 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl font-bold animate-bounce">
                  ✓
                </div>
                <div className="space-y-1">
                  <h4 className="text-zinc-100 font-bold text-sm">GITHUB ISSUE CREATED SUCCESSFULLY!</h4>
                  <p className="text-zinc-400 text-xs leading-normal">
                    The outage record has been established as Issue <span className="text-red-400 font-bold font-mono">#{issueSuccessNum}</span>
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <a
                    href={issueSuccessUrl}
                    target="_blank"
                    rel="noreferrer"
                    id="github-created-issue-link"
                    className="bg-red-950/40 border border-red-800 text-red-400 hover:text-white px-5 py-2 rounded font-bold cursor-pointer text-[11px] uppercase tracking-wider"
                  >
                    View Issue on GitHub
                  </a>
                  <button
                    onClick={() => setFileIssueOpen(false)}
                    className="text-zinc-400 hover:text-white font-bold text-[11px]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFileIssue} className="space-y-4">
                {issueError && (
                  <div className="bg-red-950/20 border border-red-900/40 p-2.5 rounded text-[11px] text-red-400">
                    ⚠️ {issueError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider border-b border-zinc-950 pb-1">
                    Issue Title Tracker
                  </label>
                  <input
                    required
                    type="text"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded p-2.5 text-zinc-200 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider border-b border-zinc-950 pb-1">
                    Issue Content SRE Markdown Telemetry
                  </label>
                  <textarea
                    required
                    value={issueBody}
                    onChange={(e) => setIssueBody(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-805 focus:border-red-500 focus:outline-none rounded p-3 h-52 text-zinc-300 leading-normal font-mono text-[11px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setFileIssueOpen(false)}
                    className="text-zinc-400 hover:text-white font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="btn-confirm-file-issue"
                    disabled={creatingIssue}
                    className="bg-red-800 hover:bg-red-700 disabled:bg-red-950 text-white font-bold px-5 py-2.5 border border-red-750 rounded uppercase cursor-pointer transition-all glow-red"
                  >
                    {creatingIssue ? 'Establishing Issue on GitHub API...' : 'Confirm & Create GitHub Issue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
