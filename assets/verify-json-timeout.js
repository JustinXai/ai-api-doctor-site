/**
 * AI API Doctor v1.9.3 — JSON/Text Timeout Verification
 * Tests whether response.json() and response.text() timeouts are truly effective
 */

'use strict';

const http = require('http');

// ── Test Configuration ──
const PORT = 3847;
const SERVER_DELAY = 5000; // 5 seconds server delay
const JSON_TIMEOUT = 1000; // 1 second JSON timeout (for testing)

// ── Mock server that delays response ──
function createSlowServer(delayMs) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Simulate slow connection - send headers immediately but delay body
      res.writeHead(200, { 'Content-Type': 'application/json' });
      
      setTimeout(() => {
        res.end(JSON.stringify({
          id: 'test-' + Date.now(),
          choices: [{
            message: { content: 'Delayed response' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }));
      }, delayMs);
    });

    server.listen(PORT, () => {
      console.log(`Mock server started on port ${PORT} (delay: ${delayMs}ms)`);
      resolve(server);
    });
  });
}

// ── Test: fetchWithTimeout aborts request ──
async function testFetchTimeout() {
  console.log('\n=== Test 1: fetchWithTimeout Abort ===');
  
  const server = await createSlowServer(SERVER_DELAY);
  
  try {
    const start = Date.now();
    
    // This should timeout after 1 second
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    
    try {
      const response = await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal
      });
      clearTimeout(timer);
      console.log('  FAIL: Should have thrown AbortError');
    } catch (err) {
      clearTimeout(timer);
      const duration = Date.now() - start;
      if (err.name === 'AbortError' || err.message.includes('aborted')) {
        console.log(`  PASS: Request aborted after ${duration}ms (expected ~1000ms)`);
      } else {
        console.log(`  FAIL: Unexpected error: ${err.message}`);
      }
    }
  } finally {
    server.close();
  }
}

// ── Test: JSON parsing with timeout ──
async function testJsonTimeout() {
  console.log('\n=== Test 2: JSON Parsing with Timeout ===');
  
  const server = await createSlowServer(SERVER_DELAY);
  
  try {
    // Simulate a response that arrives but is slow to parse
    const start = Date.now();
    
    // Create a mock response with slow json()
    const slowJsonPromise = new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT);
      
      fetch(`http://localhost:${PORT}/test`)
        .then(response => {
          // Override json() to be slow
          const originalJson = response.json.bind(response);
          response.json = () => {
            return new Promise((resolveJson, rejectJson) => {
              // Simulate slow JSON parsing
              setTimeout(() => {
                originalJson().then(resolveJson).catch(rejectJson);
              }, SERVER_DELAY);
            });
          };
          resolve({ response, controller, timer });
        })
        .catch(reject);
    });
    
    const { response, controller, timer } = await slowJsonPromise;
    
    try {
      const result = await response.json();
      clearTimeout(timer);
      console.log('  FAIL: Should have timed out');
    } catch (err) {
      clearTimeout(timer);
      const duration = Date.now() - start;
      if (err.name === 'AbortError') {
        console.log(`  PASS: JSON parsing aborted after ${duration}ms (expected ~${JSON_TIMEOUT}ms)`);
      } else {
        console.log(`  INFO: Error: ${err.message} (duration: ${duration}ms)`);
      }
    }
  } finally {
    server.close();
  }
}

// ── Test: Real-world scenario: fetchWithTimeout + JSON parse ──
async function testRealWorldScenario() {
  console.log('\n=== Test 3: Real-World Scenario (fetchWithTimeout + JSON) ===');
  
  const server = await createSlowServer(SERVER_DELAY);
  
  try {
    const start = Date.now();
    
    // Simulate checkE_TargetCall behavior
    async function checkE_TargetCallSimulation() {
      const reqEndpoint = `http://localhost:${PORT}/v1/chat/completions`;
      const timeoutMs = 2000; // 2 second step timeout
      
      // Use fetchWithTimeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(reqEndpoint, {
          method: 'POST',
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        // JSON parsing (simulated slow)
        const jsonController = new AbortController();
        const jsonTimeout = setTimeout(() => jsonController.abort(), 2000);
        
        try {
          const data = await response.json();
          clearTimeout(jsonTimeout);
          return { success: true, data, timedOut: false };
        } catch (err) {
          clearTimeout(jsonTimeout);
          return { success: false, error: err.message, timedOut: false };
        }
      } catch (err) {
        clearTimeout(timeout);
        return { success: false, error: err.message, timedOut: err.name === 'AbortError' };
      }
    }
    
    const result = await checkE_TargetCallSimulation();
    const duration = Date.now() - start;
    
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Timed Out: ${result.timedOut}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    
    if (result.timedOut && duration <= 2500) {
      console.log('  PASS: Request timed out within expected window');
    } else if (result.success) {
      console.log('  FAIL: Request should have timed out');
    } else {
      console.log('  INFO: Request failed without timeout');
    }
  } finally {
    server.close();
  }
}

// ── Test: makeApiCall default timeout ──
async function testMakeApiCallTimeout() {
  console.log('\n=== Test 4: makeApiCall Default Timeout ===');
  
  const server = await createSlowServer(8000); // 8 second server delay
  const DEFAULT_TIMEOUT = 12000; // 12 seconds default
  
  try {
    const start = Date.now();
    
    // Simulate makeApiCall behavior
    async function makeApiCallSimulation() {
      const timeoutMs = DEFAULT_TIMEOUT;
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
          method: 'POST',
          signal: controller.signal
        });
        clearTimeout(timer);
        
        let data;
        const jsonController = new AbortController();
        const jsonTimer = setTimeout(() => jsonController.abort(), 5000);
        try {
          data = await response.json();
          clearTimeout(jsonTimer);
        } catch (_) {
          clearTimeout(jsonTimer);
          data = {};
        }
        
        return { success: response.ok, data };
      } catch (err) {
        clearTimeout(timer);
        const isTimeout = err.name === 'AbortError' || err.message.includes('timeout');
        return { success: false, timedOut: isTimeout, error: err.message };
      }
    }
    
    const result = await makeApiCallSimulation();
    const duration = Date.now() - start;
    
    console.log(`  Server delay: 8000ms`);
    console.log(`  Default timeout: ${DEFAULT_TIMEOUT}ms`);
    console.log(`  Actual duration: ${duration}ms`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Timed Out: ${result.timedOut}`);
    
    if (result.success && duration < DEFAULT_TIMEOUT) {
      console.log('  PASS: Request completed within timeout window');
    } else if (result.timedOut) {
      console.log('  INFO: Request timed out (expected for very slow servers)');
    }
  } finally {
    server.close();
  }
}

// ── Run all tests ──
async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AI API Doctor v1.9.3 — JSON/Text Timeout Verification    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  await testFetchTimeout();
  await testJsonTimeout();
  await testRealWorldScenario();
  await testMakeApiCallTimeout();
  
  console.log('\n=== All Tests Complete ===\n');
}

runTests().catch(console.error);
