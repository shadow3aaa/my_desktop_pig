import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({ stdin: { contents: "export * from './frontend/src/pet/behavior'; export * from './frontend/src/pet/motion'; export * from './frontend/src/pet/move-queue';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { PetBehavior, MotionSystem, LatestMoveQueue } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const context = (scaleFactor = 1) => ({ position: { x: 100, y: 100 }, windowSize: { width: 120 * scaleFactor, height: 120 * scaleFactor }, monitor: { x: -800, y: 0, width: 1600, height: 900 }, scaleFactor });
const advance = (pet, motion, seconds) => { for (let time = 0; time < seconds; time += .01) { pet.step(.01); motion?.step(.01, pet.state); } };

test('sleep/wake interruptions keep pose and velocity, with no stale completion callback', () => {
  const pet = new PetBehavior(context()), motion = new MotionSystem(); pet.automatic = false;
  pet.request('sleep'); advance(pet, motion, .45);
  const before = motion.sample(), velocity = motion.sleepVelocity;
  pet.request('wake'); assert.deepEqual(motion.sample(), before); assert.equal(motion.sleepVelocity, velocity);
  advance(pet, motion, .2); pet.request('sleep'); advance(pet, motion, 2);
  assert.equal(pet.state, 'Sleeping'); assert.ok(motion.sleep > .999);
  pet.request('wake'); advance(pet, motion, 2);
  assert.equal(pet.state, 'Idle'); assert.ok(motion.sleep < .001);
});
test('repeated intent switching stays finite and converges', () => {
  const pet = new PetBehavior(context(), () => .8), motion = new MotionSystem(); pet.automatic = false;
  for (let index = 0; index < 300; index++) { pet.request(['sleep','wake','dance','walk','idle'][index % 5]); advance(pet, motion, .07); assert.ok(motion.sleep >= 0 && motion.sleep <= 1); for (const value of Object.values(motion.sample())) if (typeof value === 'number') assert.ok(Number.isFinite(value)); }
  pet.request('sleep'); advance(pet, motion, 3); assert.equal(pet.state, 'Sleeping'); assert.ok(motion.sleep > .9999);
});
test('native drag interrupts sleeping, holds indefinitely, and defers state requests until release', () => {
  const pet = new PetBehavior(context()); pet.request('sleep'); advance(pet, null, 2); pet.dragStart();
  pet.request('wake'); advance(pet, null, 20); assert.equal(pet.state, 'Dragged'); assert.equal(pet.elapsed, 0);
  const drop = context(); drop.position = { x: 300, y: 200 }; pet.dragEnd(drop);
  assert.equal(pet.state, 'WakingUp'); assert.deepEqual(pet.position, drop.position);
  pet.dragEnd(context()); assert.deepEqual(pet.position, drop.position);
});
test('music updates during dragging win over the old resume intent', () => {
  const pet = new PetBehavior(context()); pet.dragStart(); pet.setMusicPlaying(true); pet.dragEnd(context()); assert.equal(pet.state, 'Dancing');
  pet.dragStart(); pet.setMusicPlaying(false); pet.dragEnd(context()); assert.equal(pet.state, 'Idle');
});
test('window-top drop sleeps, but active music resumes dance', () => {
  const pet = new PetBehavior(context()); pet.dragStart(); pet.dragEnd(context(), { x: 300, y: 250 }); assert.equal(pet.state, 'FallingAsleep'); assert.deepEqual(pet.position, { x: 300, y: 250 });
  pet.dragStart(); pet.setMusicPlaying(true); pet.dragEnd(context(), { x: 300, y: 250 }); assert.equal(pet.state, 'Dancing');
});
test('walking changes facing, never overshoots, and stays inside resized/negative monitor bounds', () => {
  const pet = new PetBehavior(context(), () => .01); pet.automatic = false; pet.request('walk'); assert.equal(pet.facing, -1);
  const target = { ...pet.target }; advance(pet, null, 10); assert.deepEqual(pet.position, target); assert.equal(pet.state, 'Idle');
  pet.request('walk'); const resized = context(); resized.monitor = { x: -100, y: 0, width: 90, height: 90 }; pet.setContext(resized); advance(pet, null, 10);
  assert.ok(pet.position.x >= -92); assert.ok(pet.position.y >= 8); assert.ok(Number.isFinite(pet.position.x));
});
test('DPR scaling preserves logical movement speed', () => {
  const a = new PetBehavior(context(1), () => .9), b = new PetBehavior(context(2), () => .9);
  a.automatic = b.automatic = false; a.request('walk'); b.request('walk');
  const beforeA = { ...a.position }, beforeB = { ...b.position }; advance(a, null, .5); advance(b, null, .5);
  const travel = (p, before) => Math.hypot(p.position.x - before.x, p.position.y - before.y);
  assert.ok(Math.abs(travel(b, beforeB) / 2 - travel(a, beforeA)) < .001);
});
test('reduced motion retains sleep transitions and stops decorative and walking movement', () => {
  const pet = new PetBehavior(context(), () => .8), motion = new MotionSystem(); pet.automatic = false; motion.reduced = true;
  pet.request('walk'); const before = { ...pet.position }; for (let i = 0; i < 100; i++) { pet.step(.02, true); motion.step(.02, pet.state); } assert.deepEqual(pet.position, before);
  pet.request('sleep'); advance(pet, motion, 2); const pose = motion.sample(); assert.ok(pose.sleep > .999); for (const key of ['gait','beat','tail','ear','sway','breath','colorAngle','landingOffset']) assert.ok(pose[key] === 0);
});
test('single native move queue coalesces frames and discards queued moves on drag', async () => {
  const calls = []; let release; const waiting = new Promise(resolve => release = resolve);
  const queue = new LatestMoveQueue(async point => { calls.push(point); if (calls.length === 1) await waiting; }, error => { throw error; });
  queue.enqueue({ x: 1, y: 1 }); queue.enqueue({ x: 2, y: 2 }); queue.enqueue({ x: 3, y: 3 });
  assert.equal(calls.length, 1); const drain = queue.drain(); release(); await drain; assert.equal(calls.length, 1);
  queue.enqueue({ x: 4, y: 4 }); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls.at(-1), { x: 4, y: 4 }); queue.dispose(); queue.enqueue({ x: 5, y: 5 }); assert.equal(calls.length, 2);
});
test('invalid deltas do not corrupt spring or behavior state', () => {
  const pet = new PetBehavior(context()), motion = new MotionSystem(); const before = pet.snapshot();
  for (const dt of [NaN, Infinity, -2]) { pet.step(dt); motion.step(dt, 'Sleeping'); }
  assert.deepEqual(pet.snapshot(), before); assert.equal(motion.sleep, 0);
});
