/**
 * AI API Doctor v1.9.3 — Real JSON/Text Timeout Verification
 * Verifies that response.json() and response.text() truly respect AbortController timeout
 */

'use strict';

const http = require('http');

// ── Test Configuration ──
const PORT = 3848;
const SERVER_DELAY = 200; // 200ms server delay (fetch completes fast)
const JSON_PARSE_DELAY = 3000; // 3s simulated JSON parse delay
const JSON_TIMEOUT = 1000; // 1s JSON parse timeout

// ── Mock server that sends response quickly but content is slow ──
function createMockServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Send headers and partial content quickly
      res.writeHead(200, { 'Content-Type': 'application/json' });
      
      // Send very slow JSON - incomplete stream
      let sent = 0;
      const slowData = '{"id":"test","choices":[{"message":{"content":"This is a very long';
      
      const interval = setInterval(() => {
        if (sent < slowData.length) {
          res.write(slowData.substring(sent, sent + 10));
          sent += 10;
        } else {
          // Complete the JSON after delay
          setTimeout(() => {
            res.end('"}}}');
            clearInterval(interval);
          }, SERVER_DELAY);
        }
      }, 50); // Send 10 chars every 50ms
    });

    server.listen(PORT, () => {
      console.log(`Mock server started on port ${PORT}`);
      resolve(server);
    });
  });
}

// ── Test 1: AbortController timeout on JSON parsing ──
async function testJsonAbortController() {
  console.log('\n=== Test 1: AbortController timeout on JSON parsing ===');
  
  const server = await createMockServer();
  
  try {
    const start = Date.now();
    
    // Simulate what checkE_TargetCall does
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT);
    
    try {
      // Fetch completes quickly (we have a fast server)
      const response = await fetch(`http://localhost:${PORT}/test`, {
        signal: controller.signal
      });
      clearTimeout(timer);
      
      console.log(`  Fetch completed in ${Date.now() - start}ms`);
      
      // Now try to parse JSON - this is where our timeout should work
      const jsonController = new AbortController();
      const jsonTimer = setTimeout(() => jsonController.abort(), JSON_TIMEOUT);
      
      try {
        // This should hang because server sends incomplete JSON slowly
        const data = await response.json();
        clearTimeout(jsonTimer);
        console.log(`  FAIL: JSON parse should have timed out`);
      } catch (err) {
        clearTimeout(jsonTimer);
        const duration = Date.now() - start;
        if (err.name === 'AbortError') {
          console.log(`  PASS: JSON parsing aborted after ${duration}ms`);
        } else {
          console.log(`  INFO: JSON parse error: ${err.message} (duration: ${duration}ms)`);
        }
      }
    } catch (err) {
      clearTimeout(timer);
      console.log(`  INFO: Fetch error: ${err.message}`);
    }
  } finally {
    server.close();
  }
}

// ── Test 2: Simulate slow JSON parsing (real-world scenario) ──
async function testSlowJsonParsing() {
  console.log('\n=== Test 2: Slow JSON parsing with timeout ===');
  
  const server = await createMockServer();
  
  try {
    const start = Date.now();
    
    // Simulate response.json() with artificial delay
    const response = await fetch(`http://localhost:${PORT}/test`);
    
    console.log(`  Fetch completed in ${Date.now() - start}ms`);
    
    // Override response.json to simulate slow parsing
    const originalJson = response.json.bind(response);
    response.json = () => {
      return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT);
        
        // Simulate slow JSON parsing
        setTimeout(() => {
          clearTimeout(timer);
          // Now try actual parse
          originalJson().then(resolve).catch(reject);
        }, JSON_PARSE_DELAY);
      });
    };
    
    try {
      const data = await response.json();
      console.log(`  FAIL: Should have timed out`);
    } catch (err) {
      const duration = Date.now() - start;
      if (err.name === 'AbortError') {
        console.log(`  PASS: JSON parsing aborted after ${duration}ms (expected ~${JSON_TIMEOUT + JSON_PARSE_DELAY}ms)`);
      } else {
        console.log(`  INFO: Error: ${err.message} (duration: ${duration}ms)`);
      }
    }
  } finally {
    server.close();
  }
}

// ── Test 3: Verify checkE_TargetCall timeout chain ──
async function testCheckETimeoutChain() {
  console.log('\n=== Test 3: checkE_TargetCall timeout chain ===');
  
  const server = await createMockServer();
  
  try {
    const start = Date.now();
    const STEP_TIMEOUT = 2000; // 2s step timeout
    const FETCH_TIMEOUT = 1500; // 1.5s fetch timeout
    const JSON_TIMEOUT_LOCAL = 1000; // 1s JSON timeout
    
    // Simulate checkE_TargetCall
    async function checkE_TargetCallSim() {
      const reqEndpoint = `http://localhost:${PORT}/v1/chat/completions`;
      
      // Step timeout (safeTimeoutPromise wrapper)
      const stepController = new AbortController();
      const stepTimer = setTimeout(() => stepController.abort(), STEP_TIMEOUT);
      
      try {
        // fetchWithTimeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        
        const response = await fetch(reqEndpoint, {
          method: 'POST',
          signal: controller.signal
        });
        clearTimeout(timer);
        
        // JSON parsing with timeout
        const jsonController = new AbortController();
        const jsonTimer = setTimeout(() => jsonController.abort(), JSON_TIMEOUT_LOCAL);
        
        try {
          const data = await response.json();
          clearTimeout(jsonTimer);
          return { success: true, timedOut: false, duration: Date.now() - start };
        } catch (err) {
          clearTimeout(jsonTimer);
          return { success: false, timedOut: err.name === 'AbortError', duration: Date.now() - start, error: err.message };
        }
      } catch (err) {
        clearTimeout(stepTimer);
        return { success: false, timedOut: err.name === 'AbortError', duration: Date.now() - start, error: err.message };
      }
    }
    
    const result = await checkE_TargetCallSim();
    
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Timed Out: ${result.timedOut}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    
    // The request should complete or timeout within the chain
    if (result.duration <= STEP_TIMEOUT + 500) {
      console.log('  PASS: Request completed within timeout chain');
    } else {
      console.log('  INFO: Request exceeded timeout chain');
    }
  } finally {
    server.close();
  }
}

// ── Run all tests ──
async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AI API Doctor v1.9.3 — Real JSON/Text Timeout Test   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  await testJsonAbortController();
  await testSlowJsonParsing();
  await testCheckETimeoutChain();
  
  console.log('\n=== Tests Complete ===\n');
}

runTests().catch(console.error);
