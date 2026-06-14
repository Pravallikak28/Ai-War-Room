# 🚨 AI War Room

AI-powered incident response platform that analyzes logs, screenshots, chat discussions, and deployment events to identify root causes, coordinate responses, and generate postmortem reports.

🚀 **Live Demo:** https://ai-war-room-694578067508.asia-southeast1.run.app

---

## Overview

AI War Room is an intelligent incident management system designed for engineering teams and startups.

During production outages, engineers often struggle with:

* Scattered logs
* Slack chaos
* Unknown root causes
* Difficult postmortems

AI War Room acts as an AI SRE teammate by:

* Analyzing logs
* Understanding screenshots
* Processing Slack/Discord chats
* Building incident timelines
* Identifying root causes
* Suggesting fixes
* Generating postmortems

---

## Features

### 📂 Multimodal Incident Ingestion

Upload:

* `.log`
* `.txt`
* `.json`
* Error screenshots
* Grafana screenshots
* Slack/Discord conversations

---

### 🔍 Root Cause Analysis

Generate:

* Likely Root Cause
* Confidence Score
* System Evidence
* Affected Services
* Suggested Fixes

---

### 📈 Incident Timeline

Automatically create a chronological timeline:

Deployment

↓

Latency Spike

↓

Errors Detected

↓

Service Failure

↓

Rollback

↓

Recovery

---

### 💬 War Room Chat Analysis

Analyze engineering discussions.

Extract:

* Decisions taken
* Actions performed
* Responsible engineers
* Key events

---

### 📄 AI Postmortem Generator

Generate:

* Incident Summary
* Timeline
* Root Cause
* Impact Analysis
* Mitigation Steps
* Lessons Learned
* Action Items

Exportable as Markdown.

---

## Tech Stack

| Category     | Technology                                              |
| ------------ | ------------------------------------------------------- |
| AI Model     | Gemini                                                  |
| Platform     | Google AI Studio                                        |
| Frontend     | React                                                   |
| Backend      | Node.js                                                 |
| Database     | SQLite                                                  |
| Deployment   | Google Cloud Run                                        |
| Capabilities | Multimodal AI, Root Cause Analysis, Timeline Generation |

---

## Architecture

```text
Logs

Screenshots

Slack Chats

Deployment Info

        ↓

AI War Room

        ↓

Gemini

        ↓

Root Cause Analysis

Timeline Generation

Suggested Fixes

Postmortem Generation

        ↓

Incident Dashboard
```

---

## Future Improvements

* Incident Memory
* Similar Incident Search
* Slack Notifications
* Jira Integration
* Autonomous Incident Actions
* Knowledge Graph of Services
* Agentic Incident Investigation

---

## Author

Pravallika Kuruva

B.Tech CSE (AI & ML)

Interested in:

* Generative AI
* Agentic AI
* AI Systems
* AI for Software Engineering
