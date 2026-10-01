/**
 * EventPulse Offline-First Event Coordination Engine (v2.5 Emergency Edition)
 * Features:
 * - REAL-TIME EMERGENCY ALARM: Web Audio siren synthesizer triggered upon any operational conflict
 * - VENUE RESTORE: 1-Click "Clear All Occupancy" with 15s Undo buffer
 * - DEPOT FLUSH: 1-Click "Flush All Requisitions & Reset Gear at a Glance" with 15s Undo buffer
 * - RETURN AT A GLANCE: 1-Click "Return All Deployed Gear" to warehouse
 * - Dual View: Tactical Grid & Visual Time-Gantt (08:00 - 18:00)
 * - Live Room Occupancy percentage & status telemetry
 * - Offline outbox mutation queue & replay engine
 * - Multi-station concurrent state simulation (HQ Coordinator, Stage Ops Alice, Logistics Bob, Depot Charlie)
 * - Conflict Detection Engine (Room overlaps, Equipment depletion, Concurrent edits)
 * - OpsAI v2.5 Safe Resolution Advisor with multi-criteria optimization
 * - Comprehensive Audit Log / Event Sourcing Trail with JSON export
 * - Cross-tab real-time sync via BroadcastChannel
 */

(function () {
  'use strict';

  // --- Initial Baseline Dataset ---
  const INITIAL_ROOMS = [
    { id: 'rm-1', name: 'Grand Auditorium', capacity: 500, type: 'Keynote Hall', features: ['4K Projector', 'Stage PA', 'Dual Podiums'] },
    { id: 'rm-2', name: 'Innovation Arena', capacity: 220, type: 'Plenary', features: ['Laser Projector', 'PA System', 'Confidence Monitor'] },
    { id: 'rm-3', name: 'Hall Alpha', capacity: 140, type: 'Breakout', features: ['Projector', 'Mics'] },
    { id: 'rm-4', name: 'Workshop Suite B', capacity: 75, type: 'Interactive', features: ['Display Screen', 'Power Drops'] },
    { id: 'rm-5', name: 'VIP Executive Briefing', capacity: 30, type: 'Boardroom', features: ['Video Conf', 'Confidence Monitor'] }
  ];

  const INITIAL_INVENTORY = [
    { id: 'eq-1', name: '4K Laser Projector', category: 'Visual', total: 5, allocated: 3, unit: 'units' },
    { id: 'eq-2', name: 'Shure Wireless Mic Kit', category: 'Audio', total: 12, allocated: 8, unit: 'kits' },
    { id: 'eq-3', name: 'Concert Stage PA System', category: 'Audio', total: 4, allocated: 3, unit: 'sets' },
    { id: 'eq-4', name: '85" 4K Confidence Monitor', category: 'Visual', total: 8, allocated: 5, unit: 'screens' },
    { id: 'eq-5', name: 'Heavy-Duty Power Strip Hub', category: 'Power', total: 20, allocated: 12, unit: 'units' },
    { id: 'eq-6', name: 'High-Gain Stage Clicker', category: 'Staging', total: 10, allocated: 4, unit: 'units' }
  ];

  const INITIAL_SCHEDULE = [
    {
      id: 'sch-101',
      title: 'Opening Global Keynote: AI & The Edge',
      roomId: 'rm-1',
      speaker: 'Dr. Elena Rostova',
      startTime: '09:00',
      endTime: '10:30',
      status: 'confirmed',
      stationId: 'coordinator',
      updatedAt: '2026-10-01 08:30',
      version: 1
    },
    {
      id: 'sch-102',
      title: 'Scalable Systems Architecture Panel',
      roomId: 'rm-2',
      speaker: 'Marcus Vance, Tech Leads',
      startTime: '10:45',
      endTime: '12:00',
      status: 'confirmed',
      stationId: 'coordinator',
      updatedAt: '2026-10-01 08:45',
      version: 1
    },
    {
      id: 'sch-103',
      title: 'Hands-on Edge Computing Workshop',
      roomId: 'rm-4',
      speaker: 'Sarah Jenkins',
      startTime: '11:00',
      endTime: '12:30',
      status: 'confirmed',
      stationId: 'alice_av',
      updatedAt: '2026-10-01 09:00',
      version: 1
    },
    {
      id: 'sch-104',
      title: 'VIP Press Briefing & Product Reveal',
      roomId: 'rm-5',
      speaker: 'Executive Committee',
      startTime: '13:00',
      endTime: '14:30',
      status: 'confirmed',
      stationId: 'coordinator',
      updatedAt: '2026-10-01 09:15',
      version: 1
    }
  ];

  const INITIAL_REQUESTS = [
    {
      id: 'req-201',
      equipmentId: 'eq-1',
      equipmentName: '4K Laser Projector',
      quantity: 1,
      targetRoom: 'Grand Auditorium',
      requestedBy: 'Alice (AV)',
      stationId: 'alice_av',
      timeSlot: '08:30 - 10:30',
      priority: 'high',
      status: 'deployed',
      createdAt: '2026-10-01 08:15',
      notes: 'Main Keynote presentation backup'
    },
    {
      id: 'req-202',
      equipmentId: 'eq-2',
      equipmentName: 'Shure Wireless Mic Kit',
      quantity: 4,
      targetRoom: 'Innovation Arena',
      requestedBy: 'Bob (Logistics)',
      stationId: 'bob_logistics',
      timeSlot: '10:45 - 12:00',
      priority: 'normal',
      status: 'deployed',
      createdAt: '2026-10-01 09:30',
      notes: 'Panel discussion 4 speakers'
    },
    {
      id: 'req-203',
      equipmentId: 'eq-4',
      equipmentName: '85" 4K Confidence Monitor',
      quantity: 2,
      targetRoom: 'VIP Executive Briefing',
      requestedBy: 'HQ Coordinator',
      stationId: 'coordinator',
      timeSlot: '13:00 - 14:30',
      priority: 'high',
      status: 'approved',
      createdAt: '2026-10-01 09:40',
      notes: 'Dual teleprompter setup'
    }
  ];

  const STATIONS = {
    coordinator: { id: 'coordinator', name: 'HQ Central Command (Coordinator)', role: 'Lead Director', color: '#06b6d4' },
    alice_av: { id: 'alice_av', name: 'Alice — AV & Stage Ops (West Wing)', role: 'AV Lead', color: '#a855f7' },
    bob_logistics: { id: 'bob_logistics', name: 'Bob — Logistics & Hospitality (East Wing)', role: 'Floor Manager', color: '#f59e0b' },
    charlie_depot: { id: 'charlie_depot', name: 'Charlie — Equipment Depot & Tech Bay', role: 'Depot Manager', color: '#10b981' }
  };

  // --- State Container ---
  const STORAGE_KEY = 'eventpulse_offline_state_v2_5';
  let state = {
    isOnline: true,
    isMuted: false,
    activeStation: 'coordinator',
    roomViewMode: 'grid',
    equipCategoryFilter: 'all',
    rooms: [],
    inventory: [],
    schedule: [],
    requests: [],
    outbox: [],
    conflicts: [],
    auditLogs: [],
    lastSyncTime: new Date().toLocaleTimeString()
  };

  // Undo Buffers
  let roomUndoBuffer = null;
  let roomUndoTimer = null;
  let depotUndoBuffer = null;
  let depotUndoTimer = null;

  // Broadcast channel for multi-tab sync
  let syncChannel = null;
  try {
    syncChannel = new BroadcastChannel('eventpulse_sync_bus_v2_5');
    syncChannel.onmessage = (event) => {
      if (state.isOnline && event.data && event.data.type === 'STATE_BROADCAST') {
        mergeRemoteState(event.data.payload);
      }
    };
  } catch (e) {
    console.warn('BroadcastChannel not supported in this browser context.');
  }

  // --- EMERGENCY AUDIO SYNTHESIZER ---
  function playEmergencyAlarm() {
    if (state.isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Urgent tactical 3-burst emergency siren
      for (let burst = 0; burst < 3; burst++) {
        const startT = ctx.currentTime + (burst * 0.42);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';

        // Modulate frequency between 850Hz and 480Hz
        osc.frequency.setValueAtTime(860, startT);
        osc.frequency.exponentialRampToValueAtTime(460, startT + 0.2);
        osc.frequency.exponentialRampToValueAtTime(860, startT + 0.4);

        gain.gain.setValueAtTime(0.28, startT);
        gain.gain.linearRampToValueAtTime(0.01, startT + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startT);
        osc.stop(startT + 0.41);
      }
    } catch (e) {
      console.warn('Audio synthesis error:', e);
    }
  }

  function playTone(type) {
    if (state.isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'offline') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'clear') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(540, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'depot-flush') {
        // Double tone sweep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio autoplay policy
    }
  }

  // --- Persistence & Initialization ---
  function loadInitialState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
        runConflictDetector(false);
        return;
      } catch (e) {
        console.error('Failed to parse cached state, falling back to default seed', e);
      }
    }
    // Default seed
    state.rooms = JSON.parse(JSON.stringify(INITIAL_ROOMS));
    state.inventory = JSON.parse(JSON.stringify(INITIAL_INVENTORY));
    state.schedule = JSON.parse(JSON.stringify(INITIAL_SCHEDULE));
    state.requests = JSON.parse(JSON.stringify(INITIAL_REQUESTS));
    state.outbox = [];
    state.conflicts = [];
    state.auditLogs = [
      {
        id: 'log-seed-1',
        timestamp: new Date().toLocaleTimeString(),
        stationId: 'coordinator',
        stationName: STATIONS.coordinator.name,
        action: 'SYSTEM_BOOT',
        details: 'EventPulse v2.5 initialized with TechPulse 2026 Master Event Blueprint.',
        type: 'info'
      }
    ];
    persist();
    runConflictDetector(false);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  function broadcastCurrentState() {
    if (syncChannel && state.isOnline) {
      syncChannel.postMessage({
        type: 'STATE_BROADCAST',
        payload: {
          schedule: state.schedule,
          inventory: state.inventory,
          requests: state.requests,
          auditLogs: state.auditLogs
        }
      });
    }
  }

  function mergeRemoteState(remote) {
    if (!remote) return;
    if (remote.schedule) state.schedule = remote.schedule;
    if (remote.inventory) state.inventory = remote.inventory;
    if (remote.requests) state.requests = remote.requests;
    if (remote.auditLogs) state.auditLogs = remote.auditLogs;
    runConflictDetector(true);
    persist();
    renderAll();
    showToast('Background state synced from remote station bus', 'info');
  }

  // --- Audit Logger ---
  function logActivity(action, details, type = 'info', customStation = null) {
    const stationKey = customStation || state.activeStation;
    const station = STATIONS[stationKey] || STATIONS.coordinator;
    const entry = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toLocaleTimeString(),
      stationId: station.id,
      stationName: station.name,
      onlineStatus: state.isOnline ? 'ONLINE' : 'OFFLINE',
      action,
      details,
      type
    };
    state.auditLogs.unshift(entry);
    if (state.auditLogs.length > 100) state.auditLogs.pop();
    persist();
  }

  // --- FEATURE 1: Clear All Room Occupancy ---
  function clearAllOccupancy() {
    const previousSchedule = JSON.parse(JSON.stringify(state.schedule));
    const activeCount = previousSchedule.filter(s => s.status !== 'cancelled').length;

    if (activeCount === 0) {
      showToast('All venues are already 100% vacant.', 'info');
      return;
    }

    roomUndoBuffer = {
      schedule: previousSchedule,
      timestamp: Date.now()
    };

    state.schedule = [];

    logActivity(
      'ALL_OCCUPANCY_CLEARED',
      `[Safe Restore]: Cleared all ${activeCount} session occupancies across all 5 venues. Venues flushed to 100% vacant state.`,
      'flushed'
    );

    playTone('clear');
    runConflictDetector(false);
    persist();
    broadcastCurrentState();
    renderAll();

    showToastWithUndo(
      `Flushed ${activeCount} session occupancies. All 5 venues are now 100% vacant.`,
      'amber',
      () => undoClearOccupancy()
    );

    if (roomUndoTimer) clearTimeout(roomUndoTimer);
    roomUndoTimer = setTimeout(() => { roomUndoBuffer = null; }, 15000);
  }

  function undoClearOccupancy() {
    if (!roomUndoBuffer || !roomUndoBuffer.schedule) {
      showToast('No active room undo buffer found.', 'info');
      return;
    }

    state.schedule = roomUndoBuffer.schedule;
    const restoredCount = state.schedule.length;
    roomUndoBuffer = null;
    if (roomUndoTimer) clearTimeout(roomUndoTimer);

    logActivity(
      'OCCUPANCY_RESTORED',
      `[Undo Action]: Restored ${restoredCount} sessions back to venue schedules.`,
      'resolved'
    );

    playTone('success');
    runConflictDetector(true);
    persist();
    broadcastCurrentState();
    renderAll();
    showToast(`Successfully restored ${restoredCount} venue sessions!`, 'emerald');
  }

  // --- FEATURE 2: Flush Depot Requisitions & Remove All at a Glance ---
  function flushAllEquipmentRequests() {
    const previousRequests = JSON.parse(JSON.stringify(state.requests));
    const activeCount = previousRequests.filter(r => r.status !== 'returned' && r.status !== 'cancelled').length;

    if (activeCount === 0 && state.requests.length === 0) {
      showToast('Equipment depot already has 0 active requisitions. Stock is 100% available.', 'info');
      return;
    }

    // Save to Undo buffer
    depotUndoBuffer = {
      requests: previousRequests,
      timestamp: Date.now()
    };

    // Remove all requests at a glance
    state.requests = [];

    // Recalculate inventory immediately (all allocated = 0)
    state.inventory.forEach(i => { i.allocated = 0; });

    logActivity(
      'DEPOT_ALL_REQUISITIONS_FLUSHED',
      `[Depot Flush]: Removed all ${activeCount} equipment requisitions at a glance. All 6 hardware pools returned to 100% available warehouse stock.`,
      'flushed'
    );

    playTone('depot-flush');
    runConflictDetector(false);
    persist();
    broadcastCurrentState();
    renderAll();

    showToastWithUndo(
      `Flushed all equipment requisitions at a glance! All hardware returned to 100% depot stock.`,
      'amber',
      () => undoFlushEquipment()
    );

    if (depotUndoTimer) clearTimeout(depotUndoTimer);
    depotUndoTimer = setTimeout(() => { depotUndoBuffer = null; }, 15000);
  }

  function returnAllDeployedGear() {
    const deployedItems = state.requests.filter(r => r.status === 'deployed');
    if (deployedItems.length === 0) {
      showToast('No equipment is currently marked as deployed in the field.', 'info');
      return;
    }

    deployedItems.forEach(r => {
      r.status = 'returned';
      r.updatedAt = new Date().toLocaleTimeString();
    });

    logActivity(
      'DEPOT_ALL_RETURNED',
      `[Return at a Glance]: Checked in and marked ${deployedItems.length} deployed field gear items as returned to depot warehouse.`,
      'resolved'
    );

    playTone('success');
    runConflictDetector(false);
    persist();
    broadcastCurrentState();
    renderAll();
    showToast(`Marked ${deployedItems.length} deployed hardware items as returned!`, 'emerald');
  }

  function undoFlushEquipment() {
    if (!depotUndoBuffer || !depotUndoBuffer.requests) {
      showToast('No active depot undo buffer found.', 'info');
      return;
    }

    state.requests = depotUndoBuffer.requests;
    const restoredCount = state.requests.length;
    depotUndoBuffer = null;
    if (depotUndoTimer) clearTimeout(depotUndoTimer);

    logActivity(
      'DEPOT_REQUISITIONS_RESTORED',
      `[Undo Action]: Restored ${restoredCount} hardware requisitions back to equipment ledger.`,
      'resolved'
    );

    playTone('success');
    runConflictDetector(true);
    persist();
    broadcastCurrentState();
    renderAll();
    showToast(`Successfully restored ${restoredCount} equipment requests!`, 'emerald');
  }

  // --- CONFLICT DETECTION ENGINE & EMERGENCY SOUND TRIGGER ---
  function runConflictDetector(allowAudioAlert = true) {
    const previousConflictCount = state.conflicts.length;
    const detectedConflicts = [];

    // 1. Detect Room Schedule Collisions
    const activeSchedule = state.schedule.filter(s => s.status !== 'cancelled');
    for (let i = 0; i < activeSchedule.length; i++) {
      for (let j = i + 1; j < activeSchedule.length; j++) {
        const a = activeSchedule[i];
        const b = activeSchedule[j];

        if (a.roomId === b.roomId) {
          if (a.startTime < b.endTime && a.endTime > b.startTime) {
            const room = state.rooms.find(r => r.id === a.roomId) || { name: 'Unknown Room', capacity: 100 };
            const conflictId = `conflict-room-${a.id}-${b.id}`;

            const isOfflineClash = (a.offline || b.offline || a.stationId !== b.stationId);
            const aiRecommendation = generateRoomConflictResolution(a, b, room);

            detectedConflicts.push({
              id: conflictId,
              type: 'ROOM_OVERLAP',
              category: 'Room Double-Booking',
              severity: 'CRITICAL',
              title: `Double-Booking Clash in ${room.name}`,
              description: `Two sessions have been concurrently scheduled in ${room.name} between ${a.startTime}–${a.endTime} and ${b.startTime}–${b.endTime}.`,
              entities: [a, b],
              room,
              isOfflineClash,
              aiRecommendation
            });
          }
        }
      }
    }

    // 2. Detect Equipment Over-Allocation
    const usageMap = {};
    state.requests.forEach(req => {
      if (req.status !== 'returned' && req.status !== 'cancelled') {
        usageMap[req.equipmentId] = (usageMap[req.equipmentId] || 0) + Number(req.quantity);
      }
    });

    state.inventory.forEach(item => {
      const totalDemand = usageMap[item.id] || 0;
      item.allocated = totalDemand;
      if (totalDemand > item.total) {
        const deficit = totalDemand - item.total;
        const conflictId = `conflict-equip-${item.id}`;

        const relevantRequests = state.requests.filter(
          r => r.equipmentId === item.id && r.status !== 'returned' && r.status !== 'cancelled'
        );

        const aiRecommendation = generateEquipmentResolution(item, deficit, relevantRequests);

        detectedConflicts.push({
          id: conflictId,
          type: 'EQUIPMENT_DEFICIT',
          category: 'Equipment Stock Exhaustion',
          severity: 'HIGH',
          title: `Inventory Shortage: ${item.name}`,
          description: `Total active reservations (${totalDemand} ${item.unit}) exceed physical depot capacity (${item.total} ${item.unit}) by ${deficit} ${item.unit}.`,
          item,
          deficit,
          entities: relevantRequests,
          aiRecommendation
        });
      }
    });

    state.conflicts = detectedConflicts;

    // EMERGENCY SOUND & VISUAL ALERT TRIGGER
    if (detectedConflicts.length > 0) {
      document.body.classList.add('emergency-active');
      // If newly discovered conflicts or count increased, trigger emergency alarm sound!
      if (allowAudioAlert && detectedConflicts.length > previousConflictCount) {
        playEmergencyAlarm();
      }
    } else {
      document.body.classList.remove('emergency-active');
    }

    persist();
  }

  // --- OpsAI v2.5 Safe Resolution Advisor ---
  function generateRoomConflictResolution(sessionA, sessionB, room) {
    const availableRooms = state.rooms.filter(candidate => {
      if (candidate.id === room.id) return false;
      const clash = state.schedule.some(s =>
        s.status !== 'cancelled' &&
        s.roomId === candidate.id &&
        ((s.startTime < sessionA.endTime && s.endTime > sessionA.startTime) ||
         (s.startTime < sessionB.endTime && s.endTime > sessionB.startTime))
      );
      return !clash;
    });

    let bestAlternative = null;
    if (availableRooms.length > 0) {
      bestAlternative = availableRooms.sort((x, y) => Math.abs(x.capacity - room.capacity) - Math.abs(y.capacity - room.capacity))[0];
    }

    const sessionToMove = (sessionA.version > sessionB.version) ? sessionA : sessionB;
    const sessionToKeep = (sessionToMove.id === sessionA.id) ? sessionB : sessionA;

    if (bestAlternative) {
      return {
        strategy: 'RELOCATE_ALTERNATIVE_ROOM',
        title: `AI Triage: Relocate "${sessionToMove.title}" to ${bestAlternative.name}`,
        safePlan: `Move session "${sessionToMove.title}" into ${bestAlternative.name} (Capacity: ${bestAlternative.capacity}, AV Compatible, Zero Scheduling Conflicts). Keep "${sessionToKeep.title}" in ${room.name}.`,
        rationale: [
          `Capacity Fit: ${bestAlternative.name} accommodates up to ${bestAlternative.capacity} attendees (Target: ${room.capacity}).`,
          `AV Compatibility: Full stage gear verified for "${sessionToMove.title}".`,
          `Preserves verified schedule for "${sessionToKeep.title}" without audience disruption.`
        ],
        confidenceScore: '98%',
        actionPayload: {
          sessionId: sessionToMove.id,
          targetRoomId: bestAlternative.id,
          targetRoomName: bestAlternative.name
        }
      };
    } else {
      const shiftMinutes = 60;
      return {
        strategy: 'TIME_SLOT_SHIFT',
        title: `AI Triage: Stagger Start Times for "${sessionToMove.title}"`,
        safePlan: `Adjust "${sessionToMove.title}" schedule slot by +${shiftMinutes} minutes after "${sessionToKeep.title}" finishes, preventing venue contention.`,
        rationale: [
          `No adjacent rooms with matching capacity are unallocated.`,
          `Staggering maintains session integrity without venue re-routing.`
        ],
        confidenceScore: '91%',
        actionPayload: {
          sessionId: sessionToMove.id,
          shiftMinutes
        }
      };
    }
  }

  function generateEquipmentResolution(item, deficit, requests) {
    let substitution = null;
    if (item.name.includes('Projector')) {
      const display = state.inventory.find(i => i.name.includes('Confidence Monitor'));
      if (display && (display.total - display.allocated) >= deficit) {
        substitution = {
          substituteId: display.id,
          substituteName: display.name,
          qty: deficit
        };
      }
    } else if (item.name.includes('Mic Kit')) {
      const lowPriority = requests.find(r => r.priority === 'normal' || r.priority === 'low');
      if (lowPriority) {
        substitution = {
          reallocateFromId: lowPriority.id,
          reallocateName: lowPriority.requestedBy,
          qty: deficit
        };
      }
    }

    if (substitution && substitution.substituteName) {
      return {
        strategy: 'SUBSTITUTE_HARDWARE',
        title: `AI Triage: Substitute with ${substitution.substituteName}`,
        safePlan: `Authorize substitution of ${substitution.qty}x ${item.name} with ${substitution.qty}x ${substitution.substituteName} from Central Depot Bay.`,
        rationale: [
          `Depot contains ${state.inventory.find(i => i.id === substitution.substituteId).total - state.inventory.find(i => i.id === substitution.substituteId).allocated} surplus units.`,
          `Technical specs are cross-compatible for slide presentations & speaker telemetry.`,
          `Resolves ${deficit} unit deficit with zero schedule delay.`
        ],
        confidenceScore: '95%',
        actionPayload: {
          substituteId: substitution.substituteId,
          qty: substitution.qty
        }
      };
    } else {
      return {
        strategy: 'PRIORITIZE_CRITICAL',
        title: `AI Triage: Rebalance Inventory Based on Session Criticality`,
        safePlan: `Prioritize High-Priority Keynote tracks and share podium sound feeds for standard breakout sessions.`,
        rationale: [
          `Prevents complete equipment starvation in primary presentation hall.`,
          `Standard tracks can operate with shared podium sound feed.`
        ],
        confidenceScore: '89%',
        actionPayload: {
          rebalance: true
        }
      };
    }
  }

  // --- Offline Outbox & Mutations ---
  function applyMutation(type, payload) {
    const mutation = {
      id: 'mut-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toLocaleTimeString(),
      stationId: state.activeStation,
      type,
      payload
    };

    if (!state.isOnline) {
      state.outbox.push(mutation);
      logActivity(
        'OFFLINE_MUTATION_QUEUED',
        `[Offline Mode] Queued "${type}" locally. Will synchronize upon network restoration.`,
        'offline_edit'
      );
      executeMutationLocally(mutation, true);
      showToast(`Saved to Local Station Cache (${state.outbox.length} pending sync)`, 'amber');
    } else {
      executeMutationLocally(mutation, false);
      logActivity(type, `Executed online update from ${STATIONS[state.activeStation].name}`, 'info');
      broadcastCurrentState();
      showToast('Update synced directly to Event Cloud', 'emerald');
    }

    runConflictDetector(true);
    persist();
    renderAll();
  }

  function executeMutationLocally(mutation, isOffline) {
    const { type, payload, stationId } = mutation;

    switch (type) {
      case 'BOOK_ROOM': {
        const newBooking = {
          id: 'sch-' + Date.now() + '-' + Math.floor(Math.random() * 100),
          title: payload.title,
          roomId: payload.roomId,
          speaker: payload.speaker,
          startTime: payload.startTime,
          endTime: payload.endTime,
          status: 'confirmed',
          stationId: stationId,
          updatedAt: new Date().toLocaleTimeString(),
          version: 1,
          offline: isOffline
        };
        state.schedule.push(newBooking);
        break;
      }

      case 'REQUEST_EQUIPMENT': {
        const item = state.inventory.find(i => i.id === payload.equipmentId);
        const newReq = {
          id: 'req-' + Date.now() + '-' + Math.floor(Math.random() * 100),
          equipmentId: payload.equipmentId,
          equipmentName: item ? item.name : 'Equipment Item',
          quantity: Number(payload.quantity),
          targetRoom: payload.targetRoom,
          requestedBy: STATIONS[stationId] ? STATIONS[stationId].name.split('—')[0].trim() : 'Staff',
          stationId: stationId,
          timeSlot: payload.timeSlot || '09:00 - 17:00',
          priority: payload.priority || 'normal',
          status: 'approved',
          createdAt: new Date().toLocaleTimeString(),
          notes: payload.notes || 'Station field requisition',
          offline: isOffline
        };
        state.requests.unshift(newReq);
        break;
      }

      case 'UPDATE_REQUEST_STATUS': {
        const req = state.requests.find(r => r.id === payload.id);
        if (req) {
          req.status = payload.status;
          req.updatedAt = new Date().toLocaleTimeString();
        }
        break;
      }

      case 'DELETE_REQUEST': {
        state.requests = state.requests.filter(r => r.id !== payload.id);
        break;
      }

      case 'DELETE_SESSION': {
        state.schedule = state.schedule.filter(s => s.id !== payload.id);
        break;
      }
    }
  }

  function synchronizeOutbox() {
    if (state.outbox.length === 0) {
      showToast('No pending offline changes to sync.', 'info');
      return;
    }

    const count = state.outbox.length;
    showToast(`Reconnecting & resolving ${count} offline updates...`, 'info');
    document.getElementById('status-indicator').className = 'status-pill status-syncing';
    document.getElementById('status-text').textContent = `Syncing (${count})...`;

    setTimeout(() => {
      state.outbox = [];
      state.lastSyncTime = new Date().toLocaleTimeString();

      logActivity(
        'OUTBOX_SYNC_COMPLETE',
        `Restored connectivity. Reconciled ${count} offline field mutations across stations.`,
        'resolved'
      );

      runConflictDetector(true);
      persist();
      broadcastCurrentState();

      if (state.conflicts.length > 0) {
        showToast(`Sync complete: ${state.conflicts.length} operational conflict(s) flagged with Emergency Alert!`, 'rose');
      } else {
        playTone('success');
        showToast(`All ${count} offline updates merged seamlessly with 0 conflicts!`, 'emerald');
      }

      renderAll();
    }, 600);
  }

  // --- AI Resolution Executor ---
  function resolveConflictWithAI(conflictId) {
    const conflict = state.conflicts.find(c => c.id === conflictId);
    if (!conflict || !conflict.aiRecommendation) return;

    const rec = conflict.aiRecommendation;
    const { strategy, actionPayload } = rec;

    if (strategy === 'RELOCATE_ALTERNATIVE_ROOM') {
      const session = state.schedule.find(s => s.id === actionPayload.sessionId);
      if (session) {
        const oldRoom = state.rooms.find(r => r.id === session.roomId);
        session.roomId = actionPayload.targetRoomId;
        session.status = 'confirmed';
        session.version = (session.version || 1) + 1;
        session.offline = false;

        logActivity(
          'AI_CONFLICT_RESOLVED',
          `[OpsAI Safe Plan Applied]: Relocated "${session.title}" from ${oldRoom ? oldRoom.name : 'Old Venue'} to ${actionPayload.targetRoomName}. Collision resolved.`,
          'resolved'
        );
      }
    } else if (strategy === 'TIME_SLOT_SHIFT') {
      const session = state.schedule.find(s => s.id === actionPayload.sessionId);
      if (session) {
        session.startTime = '12:30';
        session.endTime = '14:00';
        session.version = (session.version || 1) + 1;
        session.offline = false;

        logActivity(
          'AI_CONFLICT_RESOLVED',
          `[OpsAI Safe Plan Applied]: Shifted time slot for "${session.title}" to ${session.startTime}–${session.endTime}.`,
          'resolved'
        );
      }
    } else if (strategy === 'SUBSTITUTE_HARDWARE') {
      const targetReq = conflict.entities.find(r => r.equipmentId === conflict.item.id);
      if (targetReq) {
        const subItem = state.inventory.find(i => i.id === actionPayload.substituteId);
        targetReq.equipmentId = subItem.id;
        targetReq.equipmentName = subItem.name;
        targetReq.notes += ` (Auto-substituted with ${subItem.name} by OpsAI)`;

        logActivity(
          'AI_CONFLICT_RESOLVED',
          `[OpsAI Safe Plan Applied]: Substituted ${actionPayload.qty}x ${conflict.item.name} with ${subItem.name} for ${targetReq.targetRoom}.`,
          'resolved'
        );
      }
    }

    playTone('success');
    runConflictDetector(false);
    persist();
    renderAll();
    showToast(`Conflict successfully resolved using OpsAI Advisor!`, 'emerald');
  }

  function dismissConflict(conflictId) {
    state.conflicts = state.conflicts.filter(c => c.id !== conflictId);
    if (state.conflicts.length === 0) {
      document.body.classList.remove('emergency-active');
    }
    logActivity('CONFLICT_DISMISSED', `Coordinator manually acknowledged and dismissed conflict ${conflictId}.`, 'info');
    persist();
    renderAll();
    showToast('Conflict manually dismissed by Coordinator', 'info');
  }

  // --- Rendering UI Modules ---
  function renderStatusHeader() {
    const pill = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const syncBtn = document.getElementById('btn-sync-now');

    if (!state.isOnline) {
      pill.className = 'status-pill status-offline';
      text.textContent = `Outage (Offline Mode) • ${state.outbox.length} Queued`;
      if (syncBtn) syncBtn.style.display = 'inline-flex';
    } else if (state.outbox.length > 0) {
      pill.className = 'status-pill status-syncing';
      text.textContent = `Pending Reconnection (${state.outbox.length} Queued)`;
      if (syncBtn) syncBtn.style.display = 'inline-flex';
    } else {
      pill.className = 'status-pill status-online';
      text.textContent = 'Cloud Connected • Realtime Synced';
      if (syncBtn) syncBtn.style.display = 'none';
    }

    const stationSelect = document.getElementById('station-select');
    if (stationSelect) stationSelect.value = state.activeStation;

    const conflictBadge = document.getElementById('badge-conflict-count');
    if (conflictBadge) {
      conflictBadge.textContent = state.conflicts.length;
      conflictBadge.style.display = state.conflicts.length > 0 ? 'inline-block' : 'none';
    }

    const muteBtn = document.getElementById('btn-toggle-sound');
    if (muteBtn) {
      muteBtn.textContent = state.isMuted ? '🔇 Audio Off' : '🔊 Audio On';
    }

    // Header Emergency Indicator
    const alarmBtn = document.getElementById('btn-header-alarm');
    if (alarmBtn) {
      if (state.conflicts.length > 0) {
        alarmBtn.style.display = 'inline-flex';
        alarmBtn.textContent = `🚨 ${state.conflicts.length} Emergency Clash!`;
      } else {
        alarmBtn.style.display = 'none';
      }
    }
  }

  function renderMetrics() {
    const mRooms = document.getElementById('metric-rooms');
    const mEquip = document.getElementById('metric-equipment');
    const mConflicts = document.getElementById('metric-conflicts');
    const mOutbox = document.getElementById('metric-outbox');

    if (mRooms) {
      const activeSessions = state.schedule.filter(s => s.status !== 'cancelled').length;
      mRooms.innerHTML = `${activeSessions} / ${state.rooms.length} <span style="font-size:0.75rem; color:${activeSessions === 0 ? '#34d399' : 'var(--accent-cyan)'}; font-weight:normal;">(${activeSessions === 0 ? '100% Vacant' : Math.round((activeSessions/state.rooms.length)*100) + '% Occupied'})</span>`;
    }

    if (mEquip) {
      let totalStock = 0;
      let totalAllocated = 0;
      state.inventory.forEach(i => {
        totalStock += i.total;
        totalAllocated += i.allocated;
      });
      mEquip.innerHTML = `${totalAllocated} / ${totalStock} <span style="font-size:0.75rem; color:${totalAllocated === 0 ? '#34d399' : 'var(--accent-blue)'}; font-weight:normal;">(${totalAllocated === 0 ? '100% In Stock' : totalAllocated + ' In Field'})</span>`;
    }

    if (mConflicts) {
      mConflicts.textContent = state.conflicts.length;
      mConflicts.style.color = state.conflicts.length > 0 ? 'var(--accent-rose)' : '#34d399';
    }

    if (mOutbox) {
      mOutbox.textContent = state.outbox.length;
      mOutbox.style.color = state.outbox.length > 0 ? 'var(--accent-amber)' : '#34d399';
    }
  }

  function calculateRoomOccupancy(roomId) {
    const sessions = state.schedule.filter(s => s.roomId === roomId && s.status !== 'cancelled');
    let totalMinutes = 0;

    sessions.forEach(s => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      totalMinutes += Math.max(0, endMin - startMin);
    });

    const dayMinutes = 10 * 60;
    const pct = Math.min(100, Math.round((totalMinutes / dayMinutes) * 100));
    const hours = (totalMinutes / 60).toFixed(1);
    return { pct, hours, count: sessions.length };
  }

  function renderRoomSchedules() {
    const grid = document.getElementById('room-grid');
    const ganttContainer = document.getElementById('room-gantt-container');
    if (!grid) return;

    if (state.roomViewMode === 'gantt') {
      grid.style.display = 'none';
      if (ganttContainer) {
        ganttContainer.style.display = 'block';
        renderGanttView();
      }
      return;
    }

    grid.style.display = 'grid';
    if (ganttContainer) ganttContainer.style.display = 'none';
    grid.innerHTML = '';

    state.rooms.forEach(room => {
      const roomSessions = state.schedule
        .filter(s => s.roomId === room.id && s.status !== 'cancelled')
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const hasConflict = state.conflicts.some(c => c.type === 'ROOM_OVERLAP' && c.room.id === room.id);
      const occ = calculateRoomOccupancy(room.id);

      const card = document.createElement('div');
      card.className = `room-card ${hasConflict ? 'has-conflict' : ''}`;

      let slotsHtml = '';
      if (roomSessions.length === 0) {
        slotsHtml = '<div style="color: var(--text-dim); font-size: 0.825rem; font-style: italic; padding: 1.25rem; text-align: center; border: 1px dashed var(--border-subtle); border-radius: 6px;">Venue 100% Vacant. Ready for immediate assignment.</div>';
      } else {
        slotsHtml = roomSessions.map(sess => {
          const isClashing = state.conflicts.some(c =>
            c.type === 'ROOM_OVERLAP' && c.entities.some(e => e.id === sess.id)
          );
          const isPending = sess.offline || state.outbox.some(m => m.payload && m.payload.id === sess.id);
          const author = STATIONS[sess.stationId] ? STATIONS[sess.stationId].name.split('—')[0].trim() : 'Staff';

          return `
            <div class="slot-item ${isClashing ? 'conflict' : ''} ${isPending ? 'pending-sync' : ''}">
              <div class="slot-time">
                <span>⏱ ${sess.startTime} - ${sess.endTime}</span>
                ${isClashing ? '<span style="color: var(--accent-rose); font-weight:700;">⚠ CLASH DETECTED</span>' : ''}
                ${isPending ? '<span style="color: var(--accent-amber); font-size: 0.7rem;">⚡ LOCAL CACHE</span>' : ''}
              </div>
              <div class="slot-session">${escapeHtml(sess.title)}</div>
              <div class="slot-meta">
                <span>👤 ${escapeHtml(sess.speaker)}</span>
                <div style="display:flex; align-items:center; gap:0.4rem;">
                  <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim);">${escapeHtml(author)} (v${sess.version || 1})</span>
                  <button class="btn-icon-only btn-delete-session" data-id="${sess.id}" title="Remove session slot">✕</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      card.innerHTML = `
        <div class="room-header">
          <div class="room-title-group">
            <h3>${escapeHtml(room.name)}</h3>
            <div class="room-specs">
              <span>👥 Cap: ${room.capacity}</span>
              <span>🏷 ${escapeHtml(room.type)}</span>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm btn-quick-book" data-room-id="${room.id}" title="Book slot in this room">
            + Book
          </button>
        </div>
        <div class="room-occupancy-bar">
          <div class="occupancy-label-group">
            <span>Occupancy: <strong>${occ.hours} hrs</strong> (${occ.pct}%)</span>
            <span>${occ.count === 0 ? '<span style="color:#34d399">VACANT</span>' : occ.count + ' Sessions'}</span>
          </div>
          <div class="occupancy-track">
            <div class="occupancy-fill ${occ.pct > 75 ? 'full' : occ.pct > 40 ? 'high' : ''}" style="width: ${occ.pct}%"></div>
          </div>
        </div>
        <div class="room-slots">
          ${slotsHtml}
        </div>
      `;

      grid.appendChild(card);
    });

    document.querySelectorAll('.btn-quick-book').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const roomId = e.currentTarget.getAttribute('data-room-id');
        openBookingModal(roomId);
      });
    });

    document.querySelectorAll('.btn-delete-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        applyMutation('DELETE_SESSION', { id });
      });
    });
  }

  function renderGanttView() {
    const container = document.getElementById('room-gantt-container');
    if (!container) return;

    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

    let html = `
      <div class="timeline-gantt-container">
        <table class="gantt-table">
          <thead>
            <tr>
              <th class="gantt-room-cell">Venue</th>
              ${hours.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    state.rooms.forEach(room => {
      const roomSessions = state.schedule.filter(s => s.roomId === room.id && s.status !== 'cancelled');
      html += `<tr><td class="gantt-room-cell">${escapeHtml(room.name)}<br><small style="color:var(--text-dim);font-weight:normal;">Cap: ${room.capacity}</small></td>`;

      hours.forEach((h, idx) => {
        if (idx === hours.length - 1) return;
        const nextH = hours[idx + 1];

        const active = roomSessions.filter(s => s.startTime < nextH && s.endTime > h);

        if (active.length > 1) {
          html += `<td><div class="gantt-slot-block conflict">⚠ CLASH (${active.length})</div></td>`;
        } else if (active.length === 1) {
          html += `<td><div class="gantt-slot-block" title="${escapeHtml(active[0].title)}">${escapeHtml(active[0].title.slice(0, 16))}...</div></td>`;
        } else {
          html += `<td style="color: rgba(255,255,255,0.05); text-align:center;">—</td>`;
        }
      });

      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  function renderEquipmentDepot() {
    const invGrid = document.getElementById('inventory-grid');
    const tableBody = document.getElementById('requests-table-body');
    if (!invGrid || !tableBody) return;

    const filteredInv = state.equipCategoryFilter === 'all'
      ? state.inventory
      : state.inventory.filter(i => i.category.toLowerCase() === state.equipCategoryFilter.toLowerCase());

    invGrid.innerHTML = '';
    filteredInv.forEach(item => {
      const isDepleted = item.allocated > item.total;
      const pct = Math.min(100, Math.round((item.allocated / item.total) * 100));

      const card = document.createElement('div');
      card.className = `inventory-card ${isDepleted ? 'depleted' : ''}`;
      card.innerHTML = `
        <div>
          <div class="inv-header">
            <span class="inv-title">${escapeHtml(item.name)}</span>
            <span class="inv-category">${escapeHtml(item.category)}</span>
          </div>
          <div class="inv-counts">
            <div><strong>${item.allocated}</strong> allocated</div>
            <div><strong>${Math.max(0, item.total - item.allocated)}</strong> available</div>
            <div><span style="color: var(--text-dim)">Total: ${item.total}</span></div>
          </div>
          <div class="inv-progress-bar">
            <div class="inv-progress-fill ${isDepleted ? 'danger' : ''}" style="width: ${pct}%"></div>
          </div>
        </div>
        <div style="margin-top: 0.85rem; display: flex; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm btn-quick-request" data-equip-id="${item.id}">
            + Requisition
          </button>
        </div>
      `;
      invGrid.appendChild(card);
    });

    // Requests Table
    tableBody.innerHTML = '';
    if (state.requests.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.75rem;">
        <span style="color:#34d399; font-weight:700;">✓ Depot Stock 100% Flushed & Available</span><br>
        <small style="color:var(--text-dim);">No active field requisitions. All hardware returned to storage bays.</small>
      </td></tr>`;
      return;
    }

    state.requests.forEach(req => {
      const isConflicted = state.conflicts.some(
        c => c.type === 'EQUIPMENT_DEFICIT' && c.item.id === req.equipmentId
      );

      const tr = document.createElement('tr');
      if (isConflicted) tr.className = 'row-conflict';

      const statusBadges = {
        approved: '<span style="color: #60a5fa; font-weight:600;">✓ Approved</span>',
        deployed: '<span style="color: #34d399; font-weight:600;">🚚 Deployed</span>',
        returned: '<span style="color: var(--text-dim);">↩ Returned</span>'
      };

      const priorityBadge = req.priority === 'high' 
        ? '<span style="color: #fb7185; font-weight: 700;">HIGH</span>' 
        : '<span style="color: var(--text-muted);">Normal</span>';

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHtml(req.id)}</td>
        <td><strong>${escapeHtml(req.equipmentName)}</strong> <span style="color: var(--text-muted)">(${req.quantity})</span></td>
        <td>📍 ${escapeHtml(req.targetRoom)}</td>
        <td>${escapeHtml(req.requestedBy)}</td>
        <td>${priorityBadge}</td>
        <td>${statusBadges[req.status] || req.status}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items:center;">
            ${req.status !== 'deployed' && req.status !== 'returned' ? `<button class="btn btn-secondary btn-sm btn-status-action" data-id="${req.id}" data-status="deployed" title="Deploy gear to field">Deploy</button>` : ''}
            ${req.status === 'deployed' ? `<button class="btn btn-secondary btn-sm btn-status-action" data-id="${req.id}" data-status="returned" title="Return gear to depot stock">Return</button>` : ''}
            <button class="btn-icon-only btn-delete-request" data-id="${req.id}" title="Remove requisition at a glance">✕</button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-status-action').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const status = e.currentTarget.getAttribute('data-status');
        applyMutation('UPDATE_REQUEST_STATUS', { id, status });
      });
    });

    document.querySelectorAll('.btn-delete-request').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        applyMutation('DELETE_REQUEST', { id });
      });
    });

    document.querySelectorAll('.btn-quick-request').forEach(b => {
      b.addEventListener('click', (e) => {
        const equipId = e.currentTarget.getAttribute('data-equip-id');
        openRequestModal(equipId);
      });
    });
  }

  function renderConflictCenter() {
    const container = document.getElementById('conflicts-container');
    const heroBanner = document.getElementById('conflict-hero');
    if (!container) return;

    if (state.conflicts.length === 0) {
      if (heroBanner) heroBanner.style.display = 'none';
      container.innerHTML = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 3rem 2rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem; color: #34d399;">✓</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: #ffffff;">Zero Operational Conflicts Detected</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.35rem; max-width: 520px; margin-left: auto; margin-right: auto;">
            All room schedules, equipment reservations, and local station caches are synchronized and conflict-free.
          </p>
          <div style="margin-top: 1.5rem; display:flex; justify-content:center; gap:0.75rem;">
            <button class="btn btn-secondary btn-sm" id="btn-demo-conflict-hero">
              ⚡ Trigger Simulated Outage Clash
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-test-alarm">
              🔊 Test Emergency Alarm Sound
            </button>
          </div>
        </div>
      `;

      const demoBtn = document.getElementById('btn-demo-conflict-hero');
      if (demoBtn) demoBtn.addEventListener('click', () => triggerScenario1());

      const testAlarmBtn = document.getElementById('btn-test-alarm');
      if (testAlarmBtn) {
        testAlarmBtn.addEventListener('click', () => {
          playEmergencyAlarm();
          showToast('Sounding emergency alarm test!', 'rose');
        });
      }
      return;
    }

    if (heroBanner) heroBanner.style.display = 'flex';
    document.getElementById('conflict-hero-count').textContent = state.conflicts.length;

    container.innerHTML = '';
    state.conflicts.forEach(conflict => {
      const card = document.createElement('div');
      card.className = 'conflict-card';

      let diffHtml = '';
      if (conflict.type === 'ROOM_OVERLAP') {
        const [sessA, sessB] = conflict.entities;
        diffHtml = `
          <div class="conflict-details-grid">
            <div class="conflict-side">
              <span class="side-station-badge side-station-alice">Terminal: ${sessA.stationId.toUpperCase()}</span>
              <strong>${escapeHtml(sessA.title)}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono);">
                Time: ${sessA.startTime} - ${sessA.endTime} | Speaker: ${escapeHtml(sessA.speaker)}
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-amber);">
                ${sessA.offline ? '⚡ Created Offline in local terminal' : 'Cloud Verified (v' + (sessA.version || 1) + ')'}
              </div>
            </div>
            <div class="conflict-side">
              <span class="side-station-badge side-station-bob">Terminal: ${sessB.stationId.toUpperCase()}</span>
              <strong>${escapeHtml(sessB.title)}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono);">
                Time: ${sessB.startTime} - ${sessB.endTime} | Speaker: ${escapeHtml(sessB.speaker)}
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-amber);">
                ${sessB.offline ? '⚡ Created Offline in local terminal' : 'Cloud Verified (v' + (sessB.version || 1) + ')'}
              </div>
            </div>
          </div>
        `;
      } else if (conflict.type === 'EQUIPMENT_DEFICIT') {
        diffHtml = `
          <div style="background: var(--bg-secondary); border-radius: 8px; padding: 0.85rem; font-size: 0.85rem;">
            <div style="font-weight: 600; color: #fb7185; margin-bottom: 0.25rem;">Demand Breakdown across Outage Terminals:</div>
            ${conflict.entities.map(r => `
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; padding: 0.2rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span>📍 ${escapeHtml(r.targetRoom)} (${escapeHtml(r.requestedBy)})</span>
                <span style="font-family: var(--font-mono);"><strong>${r.quantity}</strong> units [Priority: ${r.priority.toUpperCase()}]</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      let aiHtml = '';
      if (conflict.aiRecommendation) {
        const rec = conflict.aiRecommendation;
        aiHtml = `
          <div class="ai-advisor-box">
            <div class="ai-advisor-header">
              <span>🤖 OpsAI v2.5 Safe Resolution Advisor</span>
              <span style="font-size: 0.75rem; background: rgba(6, 182, 212, 0.2); padding: 0.15rem 0.5rem; border-radius: 9999px;">
                Confidence: ${rec.confidenceScore}
              </span>
            </div>
            <div class="ai-recommendation-text">
              <strong>${rec.title}</strong>
              <p style="margin-top: 0.35rem;">${rec.safePlan}</p>
            </div>
            <div class="ai-rationale">
              ${rec.rationale.map(r => `<div>• ${escapeHtml(r)}</div>`).join('')}
            </div>
            <div class="ai-action-buttons">
              <button class="btn btn-secondary btn-sm btn-dismiss-conflict" data-id="${conflict.id}">
                Dismiss / Manual Override
              </button>
              <button class="btn btn-primary btn-sm btn-apply-ai" data-id="${conflict.id}">
                ✨ Execute OpsAI Safe Resolution
              </button>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="conflict-header">
          <div class="conflict-title">
            <span>🚨</span>
            <span>${escapeHtml(conflict.title)}</span>
          </div>
          <span style="background: rgba(244,63,94,0.25); color: #fb7185; font-family: var(--font-mono); font-size: 0.75rem; font-weight:700; padding: 0.2rem 0.6rem; border-radius: 4px; box-shadow: 0 0 10px rgba(244,63,94,0.4);">
            EMERGENCY ALARM: ${conflict.severity}
          </span>
        </div>
        <p style="font-size: 0.875rem; color: var(--text-muted);">${escapeHtml(conflict.description)}</p>
        ${diffHtml}
        ${aiHtml}
      `;

      container.appendChild(card);
    });

    document.querySelectorAll('.btn-apply-ai').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        resolveConflictWithAI(id);
      });
    });

    document.querySelectorAll('.btn-dismiss-conflict').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        dismissConflict(id);
      });
    });
  }

  function renderAuditTimeline() {
    const list = document.getElementById('audit-timeline-list');
    if (!list) return;

    list.innerHTML = '';
    if (state.auditLogs.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim); padding: 1rem;">No activity logged yet.</div>';
      return;
    }

    state.auditLogs.slice(0, 60).forEach(log => {
      const item = document.createElement('div');
      item.className = `timeline-item ${log.type === 'conflict' ? 'conflict' : ''} ${log.type === 'resolved' ? 'resolved' : ''} ${log.type === 'flushed' ? 'flushed' : ''}`;

      item.innerHTML = `
        <div class="timeline-meta">
          <span>${log.timestamp} • <strong>${escapeHtml(log.stationName)}</strong></span>
          <span style="padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.65rem; background: ${log.onlineStatus === 'ONLINE' ? 'rgba(16,185,129,0.15); color: #34d399;' : 'rgba(245,158,11,0.15); color: #fbbf24;'}">
            ${log.onlineStatus || 'LOCAL'}
          </span>
        </div>
        <div style="font-weight: 600; font-size: 0.85rem; color: #ffffff; font-family: var(--font-mono); margin-top: 0.15rem;">
          ${escapeHtml(log.action)}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
          ${escapeHtml(log.details)}
        </div>
      `;
      list.appendChild(item);
    });
  }

  function renderAll() {
    renderStatusHeader();
    renderMetrics();
    renderRoomSchedules();
    renderEquipmentDepot();
    renderConflictCenter();
    renderAuditTimeline();
  }

  // --- Modals & Toasts ---
  function openBookingModal(preselectedRoomId = null) {
    const dialog = document.getElementById('dialog-booking');
    if (!dialog) return;

    const select = document.getElementById('booking-room-select');
    select.innerHTML = state.rooms.map(r => 
      `<option value="${r.id}" ${r.id === preselectedRoomId ? 'selected' : ''}>${r.name} (Cap: ${r.capacity})</option>`
    ).join('');

    dialog.showModal();
  }

  function openRequestModal(preselectedEquipId = null) {
    const dialog = document.getElementById('dialog-request');
    if (!dialog) return;

    const select = document.getElementById('request-equip-select');
    select.innerHTML = state.inventory.map(i =>
      `<option value="${i.id}" ${i.id === preselectedEquipId ? 'selected' : ''}>${i.name} (Stock: ${i.total - i.allocated} available)</option>`
    ).join('');

    const roomSelect = document.getElementById('request-room-select');
    roomSelect.innerHTML = state.rooms.map(r =>
      `<option value="${r.name}">${r.name}</option>`
    ).join('');

    dialog.showModal();
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    if (type === 'emerald') icon = '✅';
    if (type === 'rose') icon = '🚨';
    if (type === 'amber') icon = '⚡';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function showToastWithUndo(message, type = 'amber', onUndoCallback = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span>⚡</span>
      <span style="flex-grow:1;">${escapeHtml(message)}</span>
      <button class="toast-action-btn" id="btn-toast-undo">↩ Undo</button>
    `;
    container.appendChild(toast);

    const undoBtn = toast.querySelector('#btn-toast-undo');
    if (undoBtn && onUndoCallback) {
      undoBtn.addEventListener('click', () => {
        onUndoCallback();
        toast.remove();
      });
    }

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 12000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Scenario Triggers ---
  function triggerScenario1() {
    state.isOnline = false;
    playTone('offline');

    state.activeStation = 'alice_av';
    applyMutation('BOOK_ROOM', {
      title: 'Decentralized Microservices Workshop',
      roomId: 'rm-3',
      speaker: 'Alice Green (Lead Architect)',
      startTime: '14:00',
      endTime: '15:30'
    });

    state.activeStation = 'bob_logistics';
    applyMutation('BOOK_ROOM', {
      title: 'Partner Ecosystem Round-Table',
      roomId: 'rm-3',
      speaker: 'Bob Mitchell & Sponsors',
      startTime: '14:30',
      endTime: '16:00'
    });

    state.activeStation = 'coordinator';
    showToast('Simulation: Wi-Fi severed! Alice and Bob scheduled concurrent bookings in Hall Alpha while offline.', 'amber');
    renderAll();
  }

  function triggerScenario2() {
    state.isOnline = false;
    playTone('offline');

    state.activeStation = 'alice_av';
    applyMutation('REQUEST_EQUIPMENT', {
      equipmentId: 'eq-1',
      quantity: 3,
      targetRoom: 'Hall Alpha',
      priority: 'high',
      notes: 'Urgent dual-screen workshop'
    });

    state.activeStation = 'bob_logistics';
    applyMutation('REQUEST_EQUIPMENT', {
      equipmentId: 'eq-1',
      quantity: 3,
      targetRoom: 'Innovation Arena',
      priority: 'high',
      notes: 'Main sponsor showcase presentation'
    });

    state.activeStation = 'coordinator';
    showToast('Simulation: Projector requests exceeded physical depot stock during connectivity loss.', 'amber');
    renderAll();
  }

  function resetToDefault() {
    localStorage.removeItem(STORAGE_KEY);
    state.isOnline = true;
    state.activeStation = 'coordinator';
    state.roomViewMode = 'grid';
    document.body.classList.remove('emergency-active');
    loadInitialState();
    playTone('success');
    showToast('System reset to pristine event baseline.', 'emerald');
    renderAll();
  }

  // --- DOM Event Listeners ---
  function initEventBindings() {
    // 1. CLEAR ALL OCCUPANCY BUTTONS
    const btnRestoreClear = document.getElementById('btn-restore-occupancy');
    if (btnRestoreClear) btnRestoreClear.addEventListener('click', () => clearAllOccupancy());

    const btnTabRestoreClear = document.getElementById('btn-tab-restore-occupancy');
    if (btnTabRestoreClear) btnTabRestoreClear.addEventListener('click', () => clearAllOccupancy());

    // 2. EQUIPMENT DEPOT FLUSH & RETURN BUTTONS
    const btnHeaderFlushDepot = document.getElementById('btn-header-flush-depot');
    if (btnHeaderFlushDepot) btnHeaderFlushDepot.addEventListener('click', () => flushAllEquipmentRequests());

    const btnTabFlushDepot = document.getElementById('btn-tab-flush-depot');
    if (btnTabFlushDepot) btnTabFlushDepot.addEventListener('click', () => flushAllEquipmentRequests());

    const btnTabReturnAll = document.getElementById('btn-tab-return-all');
    if (btnTabReturnAll) btnTabReturnAll.addEventListener('click', () => returnAllDeployedGear());

    // Header Emergency Button click (routes directly to conflicts tab)
    const btnHeaderAlarm = document.getElementById('btn-header-alarm');
    if (btnHeaderAlarm) {
      btnHeaderAlarm.addEventListener('click', () => {
        document.querySelector('.tab-btn[data-tab="tab-conflicts"]').click();
        playEmergencyAlarm();
      });
    }

    // Toggle Online / Offline
    const toggleBtn = document.getElementById('btn-toggle-online');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        state.isOnline = !state.isOnline;
        if (state.isOnline) {
          playTone('success');
          showToast('Network restored! You are now online.', 'emerald');
          if (state.outbox.length > 0) synchronizeOutbox();
        } else {
          playTone('offline');
          showToast('Network connection severed! Switched to Offline Outage Mode.', 'amber');
        }
        persist();
        renderAll();
      });
    }

    // Sound Toggle
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        state.isMuted = !state.isMuted;
        showToast(state.isMuted ? 'Tactical audio feedback muted.' : 'Tactical audio feedback enabled.', 'info');
        persist();
        renderStatusHeader();
      });
    }

    // Station Switcher
    const stationSelect = document.getElementById('station-select');
    if (stationSelect) {
      stationSelect.addEventListener('change', (e) => {
        state.activeStation = e.target.value;
        const st = STATIONS[state.activeStation];
        showToast(`Switched active terminal to: ${st.name}`, 'info');
        persist();
        renderAll();
      });
    }

    // Manual Sync Button
    const syncBtn = document.getElementById('btn-sync-now');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        if (!state.isOnline) state.isOnline = true;
        synchronizeOutbox();
      });
    }

    // Room View Switcher
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewGantt = document.getElementById('btn-view-gantt');

    if (btnViewGrid && btnViewGantt) {
      btnViewGrid.addEventListener('click', () => {
        state.roomViewMode = 'grid';
        btnViewGrid.classList.add('btn-primary');
        btnViewGrid.classList.remove('btn-secondary');
        btnViewGantt.classList.add('btn-secondary');
        btnViewGantt.classList.remove('btn-primary');
        renderRoomSchedules();
      });

      btnViewGantt.addEventListener('click', () => {
        state.roomViewMode = 'gantt';
        btnViewGantt.classList.add('btn-primary');
        btnViewGantt.classList.remove('btn-secondary');
        btnViewGrid.classList.add('btn-secondary');
        btnViewGrid.classList.remove('btn-primary');
        renderRoomSchedules();
      });
    }

    // Inventory category filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('btn-primary'));
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.add('btn-secondary'));
        e.currentTarget.classList.add('btn-primary');
        e.currentTarget.classList.remove('btn-secondary');
        state.equipCategoryFilter = e.currentTarget.getAttribute('data-cat') || 'all';
        renderEquipmentDepot();
      });
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        const targetId = e.currentTarget.getAttribute('data-tab');
        e.currentTarget.classList.add('active');
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add('active');
      });
    });

    // Form: Booking Modal
    const formBooking = document.getElementById('form-booking');
    if (formBooking) {
      formBooking.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('booking-title').value.trim();
        const roomId = document.getElementById('booking-room-select').value;
        const speaker = document.getElementById('booking-speaker').value.trim();
        const startTime = document.getElementById('booking-start').value;
        const endTime = document.getElementById('booking-end').value;

        if (!title || !speaker || !startTime || !endTime) {
          alert('Please fill out all required schedule fields.');
          return;
        }

        applyMutation('BOOK_ROOM', { title, roomId, speaker, startTime, endTime });
        document.getElementById('dialog-booking').close();
        formBooking.reset();
      });
    }

    // Form: Request Modal
    const formRequest = document.getElementById('form-request');
    if (formRequest) {
      formRequest.addEventListener('submit', (e) => {
        e.preventDefault();
        const equipmentId = document.getElementById('request-equip-select').value;
        const quantity = document.getElementById('request-quantity').value;
        const targetRoom = document.getElementById('request-room-select').value;
        const priority = document.getElementById('request-priority').value;
        const notes = document.getElementById('request-notes').value.trim();

        applyMutation('REQUEST_EQUIPMENT', {
          equipmentId,
          quantity,
          targetRoom,
          priority,
          notes
        });

        document.getElementById('dialog-request').close();
        formRequest.reset();
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.btn-close-modal').forEach(b => {
      b.addEventListener('click', (e) => {
        const dialog = e.currentTarget.closest('dialog');
        if (dialog) dialog.close();
      });
    });

    const btnNewBooking = document.getElementById('btn-new-booking');
    if (btnNewBooking) btnNewBooking.addEventListener('click', () => openBookingModal());

    const btnNewRequest = document.getElementById('btn-new-request');
    if (btnNewRequest) btnNewRequest.addEventListener('click', () => openRequestModal());

    // Simulation Buttons
    const btnScen1 = document.getElementById('btn-scenario-1');
    if (btnScen1) btnScen1.addEventListener('click', () => triggerScenario1());

    const btnScen2 = document.getElementById('btn-scenario-2');
    if (btnScen2) btnScen2.addEventListener('click', () => triggerScenario2());

    const btnScenReset = document.getElementById('btn-scenario-reset');
    if (btnScenReset) btnScenReset.addEventListener('click', () => resetToDefault());

    const btnExportLog = document.getElementById('btn-export-log');
    if (btnExportLog) {
      btnExportLog.addEventListener('click', () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.auditLogs, null, 2));
        const dl = document.createElement('a');
        dl.setAttribute('href', dataStr);
        dl.setAttribute('download', `eventpulse-audit-log-${Date.now()}.json`);
        dl.click();
        showToast('Exported audit trail log as JSON', 'emerald');
      });
    }
  }

  // --- Bootstrap ---
  window.addEventListener('DOMContentLoaded', () => {
    loadInitialState();
    initEventBindings();
    renderAll();
    console.log('EventPulse v2.5 Operational.');
  });
})();
