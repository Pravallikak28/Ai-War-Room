import React from 'react';
import {
  ShieldAlert,
  LayoutDashboard,
  Bug,
  Settings as SettingsIcon,
  Plus,
  RefreshCw,
  Server,
  Activity,
  Cpu,
  Clock,
  Sparkles,
  Database
} from 'lucide-react';
import { Incident, DashboardStats } from './types';
import DashboardView from './components/DashboardView';
import IncidentDetailView from './components/IncidentDetailView';
import GitHubSettings from './components/GitHubSettings';

export default function App() {
  const [selectedIncidentId, setSelectedIncidentId] = React.useState<string | null>(null);
  const [incidents, setIncidents] = React.useState<Incident[]>([]);
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [activeMenu, setActiveMenu] = React.useState<'dashboard' | 'settings'>('dashboard');

  // Loading / error handling states
  const [loading, setLoading] = React.useState(true);
  const [errorLocal, setErrorLocal] = React.useState<string | null>(null);

  // Modal creation states
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newSeverity, setNewSeverity] = React.useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [creating, setCreating] = React.useState(false);

  // System environment telemetry clock (UTC)
  const [telemetryTime, setTelemetryTime] = React.useState('');

  // Fetch initial system states from backend
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorLocal(null);

      // Load incidents list
      const incRes = await fetch('/api/incidents');
      if (!incRes.ok) throw new Error('Could not synchronize incidents list');
      const incsData = await incRes.json();
      setIncidents(incsData);

      // Load metrics stats
      const statsRes = await fetch('/api/dashboard/stats');
      if (!statsRes.ok) throw new Error('Could not synchronize dashboard statistics');
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (err: any) {
      setErrorLocal(err.message || 'Unknown network error');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();

    // Spawn live telemetry clock
    const updateTime = () => {
      const now = new Date();
      setTelemetryTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Dispatch incident initialization
  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, severity: newSeverity }),
      });
      if (!res.ok) throw new Error('Could not create incident');
      const data = await res.json();
      
      setNewTitle('');
      setNewSeverity('MEDIUM');
      setCreateModalOpen(false);
      
      // Auto-refresh states and join the new incident room
      await loadData();
      setSelectedIncidentId(data.id);
      setActiveMenu('dashboard');
    } catch (err: any) {
      alert(`Declaration failed: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-200 select-none antialiased font-sans relative overflow-hidden">
      {/* Scanline CRT simulation layer */}
      <div className="scanline absolute inset-0 pointer-events-none opacity-40 z-50"></div>

      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="hidden md:flex flex-col w-64 bg-zinc-950 border-r border-zinc-800 py-6 shrink-0 relative z-10">
        <div className="px-6 space-y-5">
          {/* Logo element with technical indicators */}
          <div className="flex items-center gap-2.5">
            <div className="bg-red-600 text-white p-2 rounded border border-red-500 glow-red">
              <ShieldAlert size={20} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold font-mono uppercase tracking-tighter text-white flex items-center gap-1">
                AI War Room <span className="text-[9px] text-red-500 font-bold">&#x25B2;</span>
              </h1>
              <span className="text-[9px] font-mono font-bold tracking-widest text-zinc-500 block">
                CORE_SRE_CONSOLE
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setCreateModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 bg-red-950/30 border border-red-800/80 hover:bg-red-900/40 text-red-400 hover:text-red-200 py-2.5 px-4 rounded font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer glow-red"
          >
            <Plus size={14} />
            DECLARE CRISIS
          </button>
        </div>

        {/* Navigation Items with industrial design styling */}
        <nav className="flex-1 px-4 mt-8 space-y-1">
          <button
            id="nav-dashboard"
            onClick={() => {
              setSelectedIncidentId(null);
              setActiveMenu('dashboard');
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
              activeMenu === 'dashboard' && !selectedIncidentId
                ? 'bg-zinc-900 text-red-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white border-transparent hover:bg-zinc-900/50'
            }`}
          >
            <LayoutDashboard size={14} />
            CMD Dashboard
          </button>

          <button
            id="nav-incidents-list"
            onClick={() => {
              setSelectedIncidentId(null);
              setActiveMenu('dashboard');
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
              selectedIncidentId
                ? 'bg-zinc-900 text-red-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-300 border-transparent hover:bg-zinc-900/50'
            }`}
          >
            <Bug size={14} />
            Crisis War Rooms
            {incidents.filter((i) => i.status !== 'RESOLVED').length > 0 && (
              <span className="ml-auto text-[10px] font-mono bg-red-950/50 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded font-bold animate-pulse">
                {incidents.filter((i) => i.status !== 'RESOLVED').length}
              </span>
            )}
          </button>

          <button
            id="nav-settings"
            onClick={() => {
              setSelectedIncidentId(null);
              setActiveMenu('settings');
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
              activeMenu === 'settings'
                ? 'bg-zinc-900 text-red-400 border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white border-transparent hover:bg-zinc-900/50'
            }`}
          >
            <SettingsIcon size={14} />
            System Parameters
          </button>
        </nav>

        {/* Telemetry Core Box - Matching the Requested HTML design */}
        <div className="p-4 mx-4 mb-2 bg-zinc-950 border border-zinc-800 rounded space-y-2.5 absolute bottom-4 left-0 right-0">
          <div className="flex items-center gap-2">
            <Server size={12} className="text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
              SYS STATUS: ONLINE
            </span>
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping ml-auto" />
          </div>

          <div className="text-[9px] font-mono text-zinc-500 space-y-1 border-t border-zinc-900 pt-2">
            <div className="flex justify-between">
              <span>SQL DBMS:</span>
              <span className="text-zinc-300 font-bold">SQLite3</span>
            </div>
            <div className="flex justify-between">
              <span>Cog model:</span>
              <span className="text-yellow-500 font-bold flex items-center gap-0.5">
                <Sparkles size={8} /> 3.5-flash
              </span>
            </div>
            <div className="flex justify-between">
              <span>SESSIONS ACTIVE:</span>
              <span className="text-zinc-400">0x4F82_12A</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT LAYOUT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative z-10">
        {/* HEADER BAR */}
        <header className="h-14 bg-zinc-950/80 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-red-600 rounded-sm animate-pulse glow-red"></div>
              <h2 className="text-sm font-bold font-mono tracking-tighter uppercase italic text-zinc-100">
                AI War Room
              </h2>
            </div>
            <span className="text-zinc-500 font-mono text-[10px] px-2 py-0.5 border border-zinc-800 rounded">
              SRE_SESSION: 491-D
            </span>
          </div>

          <div className="flex items-center gap-6">
            {/* Top Stat Metrics */}
            <div className="hidden lg:flex gap-6">
              <div className="text-center">
                <div className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Total Incidents</div>
                <div className="text-xs font-mono font-bold text-zinc-300">{incidents.length}</div>
              </div>
              <div className="text-center border-l border-zinc-800 pl-6">
                <div className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Investigating</div>
                <div className="text-xs font-mono font-bold text-yellow-500">
                  {incidents.filter((i) => i.status !== 'RESOLVED').length}
                </div>
              </div>
              <div className="text-center border-l border-zinc-800 pl-6">
                <div className="text-[9px] text-red-500 uppercase font-extrabold tracking-wider">Active Room</div>
                <div className="text-xs font-mono font-bold text-red-500">
                  {selectedIncidentId || 'NONE'}
                </div>
              </div>
            </div>

            <div className="h-6 w-[1px] bg-zinc-800 hidden lg:block"></div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadData}
                disabled={loading}
                className="p-1.5 rounded border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
                title="Sync telemetry data"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>

              <div className="text-right">
                <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider font-bold">SYS_CLOCK</div>
                <div className="text-xs font-mono font-bold text-zinc-300">
                  {telemetryTime ? telemetryTime.split(' ').slice(4, 5)[0] + ' UTC' : 'SYNCING...'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* CONTAINER VIEWPORTS PORTAL */}
        <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {errorLocal && (
            <div className="bg-red-950/20 border border-red-800/50 rounded p-4 flex items-center gap-3 glow-red">
              <ShieldAlert size={18} className="text-red-500" />
              <div className="text-xs font-mono text-zinc-300">
                <span className="font-bold text-red-400">TELEMETRY ERROR:</span> {errorLocal}
              </div>
              <button
                onClick={loadData}
                className="ml-auto bg-zinc-900 text-zinc-300 text-xs px-3 py-1 border border-zinc-800 rounded hover:bg-zinc-800 font-mono"
              >
                Retry Link
              </button>
            </div>
          )}

          {activeMenu === 'dashboard' && (
            <>
              {selectedIncidentId ? (
                <IncidentDetailView
                  incidentId={selectedIncidentId}
                  onBack={() => setSelectedIncidentId(null)}
                  onRefresh={loadData}
                />
              ) : (
                stats && (
                  <DashboardView
                    stats={stats}
                    incidents={incidents}
                    onSelectIncident={(id) => setSelectedIncidentId(id)}
                    onOpenCreateModal={() => setCreateModalOpen(true)}
                    onRefresh={loadData}
                  />
                )
              )}
            </>
          )}

          {activeMenu === 'settings' && (
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 space-y-6 max-w-3xl">
              <div>
                <h2 className="text-base font-bold font-mono text-white flex items-center gap-1.5 uppercase tracking-tight">
                  <Database size={16} className="text-red-500" /> System Information & Telemetry Settings
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage deployment parameters, cognitive configurations, and local DB parameters.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-zinc-950/80 border border-zinc-800 rounded p-4 space-y-2">
                  <div className="text-xs font-bold font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <Database size={12} /> SQLite Database Configs
                  </div>
                  <div className="text-xs font-mono text-zinc-500 space-y-1 border-t border-zinc-900 pt-2">
                    <div className="flex justify-between">
                      <span>DB Path:</span>
                      <span className="text-zinc-300 font-bold">/warroom.db</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Foreign Keys:</span>
                      <span className="text-emerald-400 font-bold">Enabled</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total indexed cases:</span>
                      <span className="text-zinc-200 font-bold">{incidents.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-950/80 border border-zinc-800 rounded p-4 space-y-2">
                  <div className="text-xs font-bold font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <Cpu size={12} /> Gemini Cog Engine Configs
                  </div>
                  <div className="text-xs font-mono text-zinc-500 space-y-1 border-t border-zinc-900 pt-2">
                    <div className="flex justify-between">
                      <span>Base Model:</span>
                      <span className="text-yellow-500 font-bold uppercase flex items-center gap-0.5">
                        <Sparkles size={10} /> gemini-3.5-flash
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Response Output:</span>
                      <span className="text-zinc-300 font-bold">Structured JSON</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SLA reporting:</span>
                      <span className="text-emerald-400 font-bold">Active (Full markdown)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GitHub Integration Subsection */}
              <GitHubSettings onRefresh={loadData} />

              <div className="p-4 bg-yellow-950/20 border border-yellow-900/30 rounded space-y-1.5 font-mono">
                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider block">
                  DEPLOYMENT NOTE
                </span>
                <p className="text-xs text-zinc-400 leading-normal">
                  This application is prepared for deployment to <span className="text-zinc-200 font-bold text-slate-200">Google Cloud Run</span>. At runtime, Gemini models utilize the credentials automatically provided inside the <span className="text-zinc-300 font-bold">Settings &gt; Secrets</span> panel. Never hardcode sensitive API keys within code manifests.
                </p>
              </div>

              <button
                onClick={() => setActiveMenu('dashboard')}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-mono text-xs font-bold uppercase py-2 px-4 rounded border border-zinc-700 tracking-wider transition-colors"
              >
                &larr; Return to command panel
              </button>
            </div>
          )}
        </div>
      </main>

      {/* DISPATCH INCIDENT INITIALIZATION MODAL DIALOG */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 relative">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-white">
              <ShieldAlert className="text-red-500" size={18} />
              <h3 className="text-xs font-extrabold font-mono uppercase tracking-widest">
                DECLARE OUTAGE WAR ROOM
              </h3>
            </div>

            <form onSubmit={handleDeclareIncident} className="space-y-4 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Incident Title / Disruption Vector
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Latency spikes and 502 bad gateway on checkout service"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded p-3 text-xs text-zinc-200 placeholder-zinc-700 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Outage Severity Level
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setNewSeverity(sev)}
                      className={`text-[9px] font-bold py-2 rounded border uppercase cursor-pointer transition-all ${
                        newSeverity === sev
                          ? 'bg-red-950/40 border-red-800 text-red-400 shadow glow-red'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="text-zinc-400 hover:text-white text-xs px-4 py-2 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-red-800 hover:bg-red-700 disabled:bg-red-950 text-white font-bold text-xs py-2 px-5 border border-red-700 hover:border-red-600 rounded cursor-pointer uppercase transition-all glow-red"
                >
                  {creating ? 'Spawning...' : 'INITIATE WAR ROOM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
