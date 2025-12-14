const WebSocket = require('ws');

// Store connected Atelier dashboard clients
const atelierClients = new Set();

// Register a WebSocket client as an Atelier dashboard
function registerAtelierClient(ws) {
  atelierClients.add(ws);
  console.log(`[Atelier] Dashboard client connected (total: ${atelierClients.size})`);

  ws.on('close', () => {
    atelierClients.delete(ws);
    console.log(`[Atelier] Dashboard client disconnected (total: ${atelierClients.size})`);
  });

  ws.on('error', (error) => {
    console.error('[Atelier] Dashboard client error:', error.message);
    atelierClients.delete(ws);
  });
}

// Broadcast an event to all connected Atelier dashboards
function broadcastToAtelier(event) {
  if (atelierClients.size === 0) return;

  const message = JSON.stringify(event);
  let successCount = 0;

  atelierClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        successCount++;
      } catch (error) {
        console.error('[Atelier] Error broadcasting to client:', error.message);
        atelierClients.delete(client);
      }
    } else {
      // Clean up closed connections
      atelierClients.delete(client);
    }
  });

  if (successCount > 0) {
    console.log(`[Atelier] Broadcast ${event.type} to ${successCount} dashboard(s)`);
  }
}

// Get the number of connected Atelier clients
function getAtelierClientCount() {
  return atelierClients.size;
}

// Check if a specific client is registered as Atelier dashboard
function isAtelierClient(ws) {
  return atelierClients.has(ws);
}

module.exports = {
  registerAtelierClient,
  broadcastToAtelier,
  getAtelierClientCount,
  isAtelierClient,
};
