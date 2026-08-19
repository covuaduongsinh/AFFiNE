#!/usr/bin/env node
import { startChessSync } from './server.js';

const handle = await startChessSync();
console.log(`listening on ${handle.baseUrl}`);
