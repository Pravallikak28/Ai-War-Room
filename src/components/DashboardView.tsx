import React from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Activity, Hourglass, Search, Plus, Sparkles, SlidersHorizontal, TrendingUp, ShieldAlert, Cpu, Zap, Radio } from 'lucide-react';
import { Incident, DashboardStats } from '../types';

interface SLATimerProps {
  createdAt: string;
  severity: string;
}

export function SLACountdownTimer({ createdAt, severity }: SLATimerProps) {
  const [displayText, setDisplayText] = React.useState('');
  const [isBreached, setIsBreached] = React.useState(false);

  React.useEffect(() => {
    const calculateSLA = () => {
      const createdTime = new Date(createdAt).getTime();
      let slaDuration = 8 * 60 * 60 * 1000; // default 8h (LOW)
      if (severity === 'CRITICAL') slaDuration = 30 * 60 * 1000; // 30m
      else if (severity === 'HIGH') slaDuration = 2 * 60 * 60 * 1000; // 2h
      else if (severity === 'MEDIUM') slaDuration = 4 * 60 * 60 * 1000; // 4h

      const limitTime = createdTime + slaDuration;
      const now = Date.now();
      const diff = limitTime - now;

      if (diff <= 0) {
        setIsBreached(true);
        const absDiff = Math.abs(diff);
        const hours = Math.floor(absDiff / (1000 * 60 * 60));
        const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);
        setDisplayText(`-${hours}h ${minutes}m ${seconds}s (BREACHED)`);
      } else {
        setIsBreached(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setDisplayText(`${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s left`);
      }
    };

    calculateSLA();
    const interval = setInterval(calculateSLA, 1000);
    return () => clearInterval(interval);
  }, [createdAt, severity]);

  return (
    <span className={`font-mono text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded border leading-none shrink-0 ${
      isBreached 
        ? 'bg-red-950/40 border-red-800 text-red-500 animate-pulse' 
        : 'bg-zinc-950/60 border-zinc-800 text-yellow-500/80'
    }`}>
      SLA: {displayText}
    </span>
  );
}

interface DashboardViewProps {
  stats: DashboardStats;
  incidents: Incident[];
  onSelectIncident: (id: string) => void;
  onOpenCreateModal: () => void;
  onRefresh?: () => Promise<void> | void;
}

export default function DashboardView({
  stats,
  incidents,
  onSelectIncident,
  onOpenCreateModal,
  onRefresh,
}: DashboardViewProps) {
  const [search, setSearch] = React.useState('');
  const [severityFilter, setSeverityFilter] = React.useState<string>('ALL');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [triggeringChaos, setTriggeringChaos] = React.useState<string | null>(null);

  const handleSimulateOutage = async (scenario: string) => {
    try {
      setTriggeringChaos(scenario);
      const res = await fetch('/api/chaos/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) throw new Error('Simulation dispatch failed');
      const data = await res.json();
      
      if (onRefresh) {
        await onRefresh();
      }
      
      onSelectIncident(data.id);
    } catch (err: any) {
      alert(`Simulation failure: ${err.message}`);
    } finally {
      setTriggeringChaos(null);
    }
  };

  // Map severities to colors
  const severityColors: Record<string, string> = {
    CRITICAL: '#ef4444', // red-500
    HIGH: '#f97316',     // orange-500
    MEDIUM: '#eab308',   // yellow-500
    LOW: '#3b82f6',      // blue-500
  };

  // Build chart structures
  const chartData = [
    { name: 'Critical', count: stats.severities.CRITICAL, color: severityColors.CRITICAL },
    { name: 'High', count: stats.severities.HIGH, color: severityColors.HIGH },
    { name: 'Medium', count: stats.severities.MEDIUM, color: severityColors.MEDIUM },
    { name: 'Low', count: stats.severities.LOW, color: severityColors.LOW },
  ];

  const totalSeveritiesCount = 
    (stats.severities.CRITICAL || 0) + 
    (stats.severities.HIGH || 0) + 
    (stats.severities.MEDIUM || 0) + 
    (stats.severities.LOW || 0);

  const hasOutages = totalSeveritiesCount > 0;
  const divisor = hasOutages ? totalSeveritiesCount : 1;

  const pctCritical = Math.round(((stats.severities.CRITICAL || 0) / divisor) * 100);
  const pctHigh = Math.round(((stats.severities.HIGH || 0) / divisor) * 100);
  const pctMedium = Math.round(((stats.severities.MEDIUM || 0) / divisor) * 100);
  const pctLow = Math.round(((stats.severities.LOW || 0) / divisor) * 100);

  // Distribution historical timeline simulation based on real database records
  const timelineActivityData = incidents
    .slice()
    .reverse()
    .map((inc, idx) => {
      const date = new Date(inc.created_at);
      return {
        date: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        incidents: idx + 1,
      };
    });

  // Calculate incident counts over the last 7 calendar days
  const last7DaysData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i)); // index 6 is today, index 0 is 6 days ago
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    const year = d.getFullYear();
    const month = d.getMonth();
    const dateNumber = d.getDate();

    const count = incidents.filter((inc) => {
      const incDate = new Date(inc.created_at);
      return incDate.getFullYear() === year &&
             incDate.getMonth() === month &&
             incDate.getDate() === dateNumber;
    }).length;

    return {
      date: dateStr,
      count: count,
    };
  });

  // Filtered list
  const filteredIncidents = incidents.filter((inc) => {
    const matchesSearch = inc.title.toLowerCase().includes(search.toLowerCase()) || 
                          inc.id.toLowerCase().includes(search.toLowerCase()) ||
                          (inc.affected_services && inc.affected_services.toLowerCase().includes(search.toLowerCase()));
    const matchesSeverity = severityFilter === 'ALL' || inc.severity === severityFilter;
    const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tighter text-white flex items-center gap-2 uppercase">
            /// Incident Command Dashboard
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time telemetry feeds and Gemini cognitive incident reasoning system.
          </p>
        </div>
        <button
          id="btn-trigger-room"
          onClick={onOpenCreateModal}
          className="flex items-center gap-2 bg-red-800 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase py-2.5 px-4 rounded border border-red-700 hover:border-red-600 transition-all cursor-pointer glow-red"
        >
          <Plus size={14} />
          DECLARE INCIDENT (WAR ROOM)
        </button>
      </div>

      {/* active SLA alerts tracker ticker */}
      {incidents.filter(i => i.status !== 'RESOLVED').length > 0 && (
        <div className="bg-red-950/15 border border-red-900/35 rounded-lg p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-red-500 uppercase tracking-widest">
            <Radio size={14} className="text-red-500 animate-pulse shrink-0" />
            <span>ACTIVE CRISIS ALERTS &amp; SLA TRACKERS ({incidents.filter(i => i.status !== 'RESOLVED').length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incidents.filter(i => i.status !== 'RESOLVED').map(inc => (
              <div 
                key={inc.id}
                onClick={() => onSelectIncident(inc.id)}
                className="bg-zinc-950/80 border border-zinc-850 hover:border-red-900/50 p-3.5 rounded flex flex-col justify-between gap-3 transition-all cursor-pointer relative group"
              >
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5 select-none">
                    <span className="font-mono text-[9px] text-red-400 font-bold bg-red-950/40 border border-red-900/40 px-1.5 py-0.5 rounded">
                      {inc.id}
                    </span>
                    <span 
                      className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded tracking-wide uppercase border bg-zinc-900"
                      style={{
                        borderColor: `${severityColors[inc.severity] || '#52525b'}30`,
                        color: severityColors[inc.severity] || '#64748b',
                      }}
                    >
                      {inc.severity}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-100 group-hover:text-red-400 mt-2 line-clamp-1 truncate font-mono tracking-tight uppercase transition-colors">
                    {inc.title}
                  </h4>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-900/80 pt-2 text-[9px] text-zinc-500 font-mono">
                  <span>AGE: {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <SLACountdownTimer createdAt={inc.created_at} severity={inc.severity} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats row with a clean data-grid design and interactive severity distribution profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Left metrics block */}
        <div className="lg:col-span-2 xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total stats */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider font-bold">TOTAL OUTAGES</span>
              <div className="text-2xl font-mono font-extrabold text-white tracking-tight">{stats.total}</div>
            </div>
            <div className="p-2.5 bg-blue-950/40 text-blue-400 border border-blue-900/50 rounded animate-pulse">
              <Activity size={18} />
            </div>
          </div>

          {/* Critical stats */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider font-bold">CRITICAL INCIDENTS</span>
              <div className="text-2xl font-mono font-extrabold text-red-500 tracking-tight">{stats.severities.CRITICAL}</div>
            </div>
            <div className="p-2.5 bg-red-950/40 text-red-400 border border-red-900/55 rounded glow-red">
              <AlertCircle size={18} />
            </div>
          </div>

          {/* Under Investigation */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 flex items-center justify-between shadow-xs">
            <div className="space-y-1 flex-1">
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider font-bold">INVESTIGATING</span>
              <div className="text-2xl font-mono font-extrabold text-yellow-500 tracking-tight">{stats.open}</div>
            </div>
            <div className="p-2.5 bg-yellow-950/30 text-yellow-500 border border-yellow-905/40 rounded">
              <Hourglass size={18} />
            </div>
          </div>

          {/* Resolved stats */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider font-bold">RESOLVED CASES</span>
              <div className="text-2xl font-mono font-extrabold text-emerald-500 tracking-tight">{stats.resolved}</div>
            </div>
            <div className="p-2.5 bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 rounded">
              <CheckCircle size={18} />
            </div>
          </div>
        </div>

        {/* Severity Metrics Breakdown visual progress card */}
        <div id="severity-distribution-card" className="bg-zinc-900/30 border border-zinc-800 rounded p-4 flex flex-col justify-center shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-mono tracking-wider font-bold uppercase">
                /// Severity Distribution Profile
              </span>
              <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase bg-zinc-950/40 px-1.5 py-0.5 rounded border border-zinc-800/40">
                RATIO
              </span>
            </div>

            {hasOutages ? (
              <div className="space-y-3">
                {/* Horizontal progress/stacked bar style chart */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-sm bg-zinc-950 overflow-hidden flex border border-zinc-900/50 shadow-inner">
                    {stats.severities.CRITICAL > 0 && (
                      <div 
                        style={{ width: `${pctCritical}%` }} 
                        className="bg-red-500 h-full transition-all duration-300" 
                        title={`CRITICAL: ${stats.severities.CRITICAL}`} 
                      />
                    )}
                    {stats.severities.HIGH > 0 && (
                      <div 
                        style={{ width: `${pctHigh}%` }} 
                        className="bg-orange-500 h-full transition-all duration-300" 
                        title={`HIGH: ${stats.severities.HIGH}`} 
                      />
                    )}
                    {stats.severities.MEDIUM > 0 && (
                      <div 
                        style={{ width: `${pctMedium}%` }} 
                        className="bg-yellow-500 h-full transition-all duration-300" 
                        title={`MEDIUM: ${stats.severities.MEDIUM}`} 
                      />
                    )}
                    {stats.severities.LOW > 0 && (
                      <div 
                        style={{ width: `${pctLow}%` }} 
                        className="bg-blue-500 h-full transition-all duration-300" 
                        title={`LOW: ${stats.severities.LOW}`} 
                      />
                    )}
                  </div>
                </div>

                {/* Individual progress-bar gauges */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1.5">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-zinc-500 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> CRIT
                      </span>
                      <span className="text-zinc-300 font-bold">{stats.severities.CRITICAL || 0}</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-950 rounded-xs overflow-hidden">
                      <div className="bg-red-500 h-full rounded-xs" style={{ width: `${pctCritical}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-zinc-500 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> HIGH
                      </span>
                      <span className="text-zinc-300 font-bold">{stats.severities.HIGH || 0}</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-950 rounded-xs overflow-hidden">
                      <div className="bg-orange-500 h-full rounded-xs" style={{ width: `${pctHigh}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-zinc-500 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> MED
                      </span>
                      <span className="text-zinc-300 font-bold">{stats.severities.MEDIUM || 0}</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-950 rounded-xs overflow-hidden">
                      <div className="bg-yellow-500 h-full rounded-xs" style={{ width: `${pctMedium}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-zinc-500 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> LOW
                      </span>
                      <span className="text-zinc-300 font-bold">{stats.severities.LOW || 0}</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-950 rounded-xs overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-xs" style={{ width: `${pctLow}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-2.5 text-center">
                <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-tight block">No outages recorded</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts section with custom theme values */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Severity Metrics Chart */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 space-y-4 shadow-xs">
          <h2 className="text-[10px] font-bold font-mono text-zinc-400 tracking-widest flex items-center gap-1 uppercase">
            /// SEVERITY SPECTRUM
          </h2>
          <div className="h-44 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ backgroundColor: '#121214', borderColor: '#27272a', color: '#fff', fontSize: 10 }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={24}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incident Trend Line Chart - 7 Days */}
        <div id="7day-incident-trend-card" className="bg-zinc-900/30 border border-zinc-800 rounded p-4 space-y-4 shadow-xs">
          <h2 className="text-[10px] font-bold font-mono text-zinc-400 tracking-widest flex items-center gap-1 uppercase">
            <TrendingUp size={12} className="text-purple-400 inline" /> /// INCIDENT TREND (7 DAYS)
          </h2>
          <div className="h-44 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7DaysData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#121214', borderColor: '#27272a', color: '#fff', fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#a855f7"
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                  dot={{ r: 3, fill: '#a855f7', stroke: '#121214', strokeWidth: 1.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* System Activity Timeline Chart */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded p-4 space-y-4 shadow-xs">
          <h2 className="text-[10px] font-bold font-mono text-zinc-400 tracking-widest flex items-center gap-1 uppercase">
            /// CUMULATIVE INCIDENT INDEX
          </h2>
          <div className="h-44 w-full mt-2">
            {timelineActivityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineActivityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncidents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                  <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#121214', borderColor: '#27272a', color: '#fff', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="incidents"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#colorIncidents)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs font-mono">
                No active metrics to plot. Declaring a new crisis room to index activity.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SRE OUTAGE & CHAOS SIMULATOR SANDBOX */}
      <div className="bg-zinc-900/10 border border-zinc-800 rounded-lg p-5 space-y-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Zap size={140} className="text-zinc-600" />
        </div>
        
        <div>
          <h2 className="text-[10px] font-bold font-mono text-zinc-400 tracking-widest flex items-center gap-1.5 uppercase">
            <Zap size={12} className="text-yellow-500 animate-pulse" /> /// SRE SIMULATION SUITE (CHAOS INJECTOR)
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Simulate realistic production failures to evaluate response pipelines and train SRE playbooks under load.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-950/80 border border-zinc-850 hover:border-red-900/40 p-4 rounded-lg flex flex-col justify-between gap-3 transition-colors relative group">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono bg-red-950/40 border border-red-900/40 text-red-405 px-2 py-0.5 rounded uppercase font-bold">CRITICAL OUTAGE</span>
                <span className="text-[9px] font-mono text-zinc-500 font-bold">100% DISRUPTIVE</span>
              </div>
              <h3 className="text-xs font-bold text-zinc-100 font-mono mt-2 group-hover:text-red-400 transition-colors uppercase">
                Cascade Timeout Failure
              </h3>
              <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                Trigger third-party payment gateway throttling that exhausts process thread pools, causing cascading 504 and OOM crashes.
              </p>
            </div>
            <button
              id="chaos-inject-cascade"
              onClick={() => handleSimulateOutage('microservice_cascade')}
              disabled={!!triggeringChaos}
              className="w-full bg-red-950/30 hover:bg-red-900/40 text-red-400 font-mono text-[10px] font-bold py-1.5 px-3 rounded border border-red-800/50 hover:border-red-700 uppercase cursor-pointer transition-colors disabled:opacity-40"
            >
              {triggeringChaos === 'microservice_cascade' ? 'Injecting Chaos...' : 'Inject Cascade Fault'}
            </button>
          </div>

          <div className="bg-zinc-950/80 border border-zinc-850 hover:border-orange-900/40 p-4 rounded-lg flex flex-col justify-between gap-3 transition-colors relative group">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono bg-orange-950/40 border border-orange-900/40 text-orange-405 px-2 py-0.5 rounded uppercase font-bold">HIGH OUTAGE</span>
                <span className="text-[9px] font-mono text-zinc-500 font-bold">60% THRUPUT LOSS</span>
              </div>
              <h3 className="text-xs font-bold text-zinc-100 font-mono mt-2 group-hover:text-orange-400 transition-colors uppercase">
                Cache Eviction Storm
              </h3>
              <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                Trigger millions of Redis key invalidations sparking thundering-herd database queries that exhaust Postgres read connections.
              </p>
            </div>
            <button
              id="chaos-inject-cache"
              onClick={() => handleSimulateOutage('cache_invalidation_storm')}
              disabled={!!triggeringChaos}
              className="w-full bg-orange-950/30 hover:bg-orange-900/40 text-orange-400 font-mono text-[10px] font-bold py-1.5 px-3 rounded border border-orange-850/50 hover:border-orange-700 uppercase cursor-pointer transition-colors disabled:opacity-40"
            >
              {triggeringChaos === 'cache_invalidation_storm' ? 'Injecting Chaos...' : 'Inject Key Storm'}
            </button>
          </div>

          <div className="bg-zinc-950/80 border border-zinc-850 hover:border-blue-900/40 p-4 rounded-lg flex flex-col justify-between gap-3 transition-colors relative group">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono bg-blue-950/40 border border-blue-900/40 text-blue-405 px-2 py-0.5 rounded uppercase font-bold">MEDIUM DEVIATION</span>
                <span className="text-[9px] font-mono text-zinc-500 font-bold">20% CRYPTO DELAY</span>
              </div>
              <h3 className="text-xs font-bold text-zinc-100 font-mono mt-2 group-hover:text-blue-400 transition-colors uppercase">
                Kubernetes CPU Shackle
              </h3>
              <p className="text-[11px] text-zinc-400 leading-normal font-sans">
                Set OAuth service container CPU limits below minimum Bcrypt hashing loop demands, forcing cgroups throttling and token delays.
              </p>
            </div>
            <button
              id="chaos-inject-cpu"
              onClick={() => handleSimulateOutage('cpu_throttling')}
              disabled={!!triggeringChaos}
              className="w-full bg-blue-950/30 hover:bg-blue-900/40 text-blue-400 font-mono text-[10px] font-bold py-1.5 px-3 rounded border border-blue-800/50 hover:border-blue-700 uppercase cursor-pointer transition-colors disabled:opacity-40"
            >
              {triggeringChaos === 'cpu_throttling' ? 'Injecting Chaos...' : 'Inject Limit Constraint'}
            </button>
          </div>
        </div>
      </div>

      {/* Incidents search & filters and table list */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between bg-zinc-900/10 border border-zinc-800 rounded p-4">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <input
              type="text"
              placeholder="FILTER_BY_ID, DISRUPTION TYPE, MICROSERVICE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-500 focus:outline-none rounded py-2 pl-10 pr-4 text-xs font-mono placeholder-zinc-700 text-zinc-200 transition-colors"
            />
          </div>

          {/* Filters controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={12} className="text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-500 font-bold">SEVERITY:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded text-xs py-1.5 px-3 text-zinc-300 font-mono focus:outline-none focus:border-zinc-700"
              >
                <option value="ALL">ALL SEVERITIES</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-500 font-bold">STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded text-xs py-1.5 px-3 text-zinc-300 font-mono focus:outline-none focus:border-zinc-700"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="OPEN">OPEN / UNSTABLE</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
          </div>
        </div>

        {/* Incident rows list */}
        <div className="bg-zinc-950 border border-zinc-800 rounded overflow-hidden shadow-xs">
          {filteredIncidents.length > 0 ? (
            <div className="divide-y divide-zinc-900">
              {filteredIncidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => onSelectIncident(inc.id)}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/50 cursor-pointer transition-colors"
                >
                  <div className="space-y-1.5 flex-1 select-none">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-[9px] text-red-400 font-bold bg-red-950/30 border border-red-900/40 px-2 py-0.5 rounded">
                        {inc.id}
                      </span>
                      
                      {/* Severity badge info */}
                      <span
                        className="text-[9px] font-bold font-mono px-2 py-0.5 rounded tracking-wide uppercase border bg-zinc-900"
                        style={{
                          borderColor: `${severityColors[inc.severity] || '#52525b'}30`,
                          color: severityColors[inc.severity] || '#64748b',
                        }}
                      >
                        {inc.severity}
                      </span>

                      {/* Status badge and metadata */}
                      <span
                        className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded tracking-wide uppercase border ${
                          inc.status === 'RESOLVED'
                            ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                            : inc.status === 'INVESTIGATING'
                            ? 'bg-yellow-950/20 border-yellow-905/30 text-yellow-500 animate-pulse'
                            : 'bg-red-950/20 border-red-900/30 text-red-500'
                        }`}
                      >
                        {inc.status}
                      </span>

                      {inc.affected_services && (
                        <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900/30 border border-zinc-800 px-2 py-0.5 rounded">
                          {inc.affected_services.split(',')[0]}
                        </span>
                      )}

                      {inc.status !== 'RESOLVED' && (
                        <SLACountdownTimer createdAt={inc.created_at} severity={inc.severity} />
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-zinc-100 tracking-tight hover:text-red-400 transition-colors">
                      {inc.title}
                    </h3>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                      <span>Declared {new Date(inc.created_at).toLocaleString()}</span>
                      {inc.confidence_score && (
                        <>
                          <span>•</span>
                          <span className="text-yellow-600/90 flex items-center gap-1">
                            <Sparkles size={10} /> AI Confidence: {inc.confidence_score}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions / trigger chevron link */}
                  <div className="flex items-center gap-3 self-end md:self-center">
                    <span className="text-xs font-mono text-zinc-500 hover:text-zinc-300">
                      Enter War Room &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-2">
              <AlertCircle size={24} className="text-zinc-700" />
              <p className="text-zinc-500 text-xs font-mono">No incidents matched your filter queries.</p>
              <button
                id="btn-clear-dash-filters"
                onClick={() => {
                  setSearch('');
                  setSeverityFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className="text-[10px] font-mono text-red-500 underline hover:text-red-400 cursor-pointer"
              >
                Clear all active filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
