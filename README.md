# EventPulse // Resilient Offline-First Event Coordination System (v2.5 Emergency Edition)

> **Mission**: Guarantee zero operational disruption during critical summits, conferences, and festivals even when Wi-Fi, 4G, or cloud services completely fail.

---

## ⚡ What's New in v2.5

* 🚨 **Automated Emergency Alarm on Conflict**:
  * Real-time Web Audio API siren synthesizer plays an urgent oscillating klaxon whenever an operational conflict occurs (room overlap or depot depletion).
  * Entire viewport activates an **emergency flashing red ambient border** (`emergency-active`).
  * A dedicated **`🚨 Emergency Clash Active!`** button pulses in the header to jump straight to the AI triage center.
  * Added **`🔊 Test Emergency Alarm Sound`** button in the Conflicts tab so you can test audio anytime.
* 📦 **Equipment Depot Flush & Batch Clear at a Glance**:
  * Added **`📦 Flush Requisitions at a Glance`** (in both header and Equipment Depot tab):
    * Immediately flushes all active equipment requisitions across all stations.
    * Resets hardware allocations to `0`, restoring 100% of physical gear back to available warehouse stock.
    * Auto-resolves any active hardware depletion conflicts (`EQUIPMENT_DEFICIT`).
    * Includes a **15-second Undo buffer** (`↩ Undo`) in case of accidental clicks.
  * Added **`↩ Return All Deployed Gear`**: Instantly checks in all field-deployed gear back to warehouse inventory in 1 click.
  * Added per-row **`✕`** quick removal buttons to delete individual requisitions at a glance.
* 🧹 **Safe Restore & Clear All Room Occupancy**:
  * Instantly flushes all room schedules across all 5 venues to 100% vacant state with 15s Undo buffer.
* 📊 **Dual Visualization**:
  * Switch between Card View and Interactive Timeline Gantt View (08:00 - 18:00).

---

## 🚀 Live Access

### 1. Live Local Server
👉 **[http://localhost:8000](http://localhost:8000)** *(Simply refresh your browser!)*

### 2. Direct File Access
👉 [**Open `index.html`**](file:///C:/Users/shanmukh%20nath/.gemini/antigravity/scratch/event-offline-ops/index.html)
