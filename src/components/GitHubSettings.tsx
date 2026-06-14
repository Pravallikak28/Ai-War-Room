import React from 'react';
import { Database, GitFork, Github, Link2, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

interface GitHubSettingsProps {
  onRefresh?: () => void;
}

export interface GitHubConfigState {
  connected: boolean;
  repo_owner?: string;
  repo_name?: string;
  authenticated_user?: string;
  avatar_url?: string;
  created_at?: string;
}

export default function GitHubSettings({ onRefresh }: GitHubSettingsProps) {
  const [config, setConfig] = React.useState<GitHubConfigState>({ connected: false });
  const [loading, setLoading] = React.useState(true);
  const [tokenInput, setTokenInput] = React.useState('');
  const [repoInput, setRepoInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [oauthUrl, setOauthUrl] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/github/settings');
      if (!res.ok) throw new Error('Unresolved integration state');
      const data = await res.json();
      setConfig(data);
      if (data.connected) {
        setRepoInput(`${data.repo_owner}/${data.repo_name}`);
      }

      // Check if OAuth is available
      const oauthRes = await fetch('/api/github/oauth/url');
      if (oauthRes.ok) {
        const oauthData = await oauthRes.json();
        if (oauthData.oauthEnabled && oauthData.url) {
          setOauthUrl(oauthData.url);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not fetch integration data');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchConfig();

    // Listen for OAuth success messaging from popup
    const handleOauthMessage = (e: MessageEvent) => {
      const origin = e.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setSuccessMsg('Successfully linked GitHub account!');
        fetchConfig();
        if (onRefresh) onRefresh();
      }
    };

    window.addEventListener('message', handleOauthMessage);
    return () => window.removeEventListener('message', handleOauthMessage);
  }, []);

  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg('Personal Access Token is required');
      return;
    }
    if (!repoInput.trim() || !repoInput.includes('/')) {
      setErrorMsg('Please specify target repository in "owner/name" format (e.g. facebook/react)');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch('/api/github/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: tokenInput.trim(),
          repository: repoInput.trim()
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Connection configuration failed');
      }

      setSuccessMsg('GitHub Integration saved & authenticated successfully!');
      setTokenInput('');
      fetchConfig();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthConnect = () => {
    if (!oauthUrl) return;
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      oauthUrl,
      'github_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popup) {
      alert('Popup blocker detected. Please allow popups for SRE Console to connect to GitHub.');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this GitHub connection?')) return;
    try {
      setSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      
      const res = await fetch('/api/github/settings', {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Could not unlink account');
      
      setSuccessMsg('GitHub service unlinked.');
      setConfig({ connected: false });
      setRepoInput('');
      setTokenInput('');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-850 p-6 rounded-lg flex items-center justify-center gap-2">
        <RefreshCw size={14} className="animate-spin text-red-500" />
        <span className="text-xs font-mono text-zinc-400">LOADING GITHUB PIPELINES...</span>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950/80 border border-zinc-800 rounded p-5 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2">
          <Github size={16} className="text-white" />
          <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
            GitHub Integration Control
          </h3>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
          config.connected
            ? 'bg-emerald-950/30 border-emerald-800 text-emerald-400 animate-pulse'
            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
        }`}>
          {config.connected ? '● GITHUB ACTIVE' : '○ DISCONNECTED'}
        </span>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/15 border border-emerald-850/40 p-2.5 rounded text-[11px] text-emerald-400">
          ✓ {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/15 border border-red-850/40 p-2.5 rounded text-[11px] text-red-400 flex items-start gap-1.5 leading-snug">
          <ShieldAlert size={14} className="shrink-0 text-red-500 mt-0.5" />
          <span>Error: {errorMsg}</span>
        </div>
      )}

      {config.connected ? (
        <div className="space-y-4">
          <div className="bg-zinc-900/40 border border-zinc-850 p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {config.avatar_url ? (
                <img 
                  src={config.avatar_url} 
                  alt={config.authenticated_user} 
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded border border-zinc-700 bg-zinc-950" 
                />
              ) : (
                <div className="w-10 h-10 rounded border border-zinc-700 bg-zinc-950 flex items-center justify-center">
                  <Github size={16} className="text-zinc-500" />
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold text-zinc-200">
                  Connected as: <span className="text-red-400 font-bold">@{config.authenticated_user}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 leading-none">
                  Sync established {new Date(config.created_at || '').toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 px-3 py-2 rounded border border-zinc-850 space-y-1 sm:text-right shrink-0">
              <span className="text-[9px] text-zinc-500 block">TARGET REPOSITORY</span>
              <a 
                href={`https://github.com/${config.repo_owner}/${config.repo_name}`}
                target="_blank"
                rel="noreferrer"
                id="github-linked-repo-badge"
                className="text-[11px] font-bold text-zinc-300 hover:text-red-400 flex items-center gap-1 cursor-pointer"
              >
                <GitFork size={12} className="text-red-500" />
                {config.repo_owner}/{config.repo_name}
              </a>
            </div>
          </div>

          <div className="space-y-2 border-t border-zinc-900 pt-3">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Link a different repository
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="e.g. facebook/react"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 focus:border-red-500 focus:outline-none text-zinc-200"
              />
              <button
                id="github-save-repo-btn"
                onClick={async () => {
                  if (!repoInput.trim() || !repoInput.includes('/')) {
                    setErrorMsg('Repository must be owner/name format');
                    return;
                  }
                  try {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    const res = await fetch('/api/github/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        access_token: 'default', // triggers backend to preserve token but swap repo
                        repository: repoInput
                      })
                    });
                    if (!res.ok) throw new Error('Failed to update target repository');
                    setSuccessMsg('GitHub target repository updated!');
                    fetchConfig();
                  } catch (e: any) {
                    setErrorMsg(e.message);
                  }
                }}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 px-3.5 py-1.5 rounded cursor-pointer transition-colors"
              >
                Update
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center border-t border-zinc-900 pt-3">
            <span className="text-[10px] text-zinc-500">Need to revoke privileges or swap developers?</span>
            <button
              id="github-disconnect-btn"
              onClick={handleDisconnect}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-red-950/30 border border-red-900/60 hover:bg-red-900/40 hover:border-red-600 text-red-400 font-bold px-3 py-1.5 rounded uppercase text-[10px] transition-all cursor-pointer"
            >
              <Trash2 size={12} /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-zinc-400 leading-snug">
            Establish a webhook link to your code repositories. Enables SREs to file **GitHub Issues** describing production outages directly from the active war room, and open automatic **hotfix Pull Requests** addressing failed modules with suggested fixes.
          </p>

          {oauthUrl && (
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded text-center space-y-2.5">
              <span className="text-[10px] text-zinc-400 font-bold block">RECOMMENDED CLIENT AUTHORIZATION</span>
              <button
                type="button"
                id="github-oauth-connect-btn"
                onClick={handleOAuthConnect}
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-red-900/40 hover:bg-red-800 text-red-200 border border-red-700 px-5 py-2 rounded font-mono font-bold uppercase transition-all cursor-pointer glow-red"
              >
                <Github size={14} className="animate-pulse" />
                Secure GitHub OAuth Connect
              </button>
              <span className="text-[9px] text-zinc-500 block">Uses secure postMessage popups within AI Studio</span>
            </div>
          )}

          <form onSubmit={handleManualConnect} className="space-y-3.5 bg-zinc-900/10 border border-zinc-850 p-4 rounded-lg">
            <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wide">
              {oauthUrl ? '— OR — Configure manually with Personal Access Token (PAT)' : 'Configure with Personal Access Token (PAT)'}
            </span>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 block uppercase">
                GitHub Personal Access Token (PAT)
              </label>
              <input
                type="password"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 focus:border-red-500 focus:outline-none text-zinc-200 font-sans"
              />
              <span className="text-[9px] text-zinc-500 block">
                Requires <code className="bg-zinc-950 px-1 py-0.5 rounded text-red-400">repo</code> scope to write issues and commit files for PRs.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 block uppercase">
                Target GitHub Repository
              </label>
              <input
                type="text"
                required
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="e.g. octocat/hello-world"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 focus:border-red-500 focus:outline-none text-zinc-200"
              />
              <span className="text-[9px] text-zinc-500 block">
                Target code repository where tickets and patch branches/PRs will be directed.
              </span>
            </div>

            <button
              type="submit"
              id="github-manual-submit-btn"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-1.5 bg-zinc-900 border border-zinc-805 hover:bg-zinc-850 text-white font-bold py-2 rounded transition-colors uppercase text-[10px] cursor-pointer"
            >
              <Link2 size={12} /> {submitting ? 'Verifying Integrity...' : 'Integrate GitHub Link'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
