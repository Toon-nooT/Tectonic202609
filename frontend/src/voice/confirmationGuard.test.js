import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmationGuard } from './confirmationGuard.js';
const sentence = 'The night shift uses seven and a half hours from January.';
function prepared() { const guard = new ConfirmationGuard(); const draft = guard.prepare(sentence); return {guard,draft}; }
test('model tool request alone cannot publish', () => { const {guard,draft}=prepared(); assert.throws(()=>guard.consume(draft.id)); });
test('confirmation before completed readback cannot publish', () => {const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.user('yes');assert.throws(()=>guard.consume(draft.id));});
test('completed readback then explicit yes publishes once', () => {const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.user('Yes, please.');assert.equal(guard.consume(draft.id),sentence);assert.throws(()=>guard.consume(draft.id));});
for (const reply of ['yes but only after February', 'probably', '', 'no', 'later', 'yes no wait']) test(`rejects ${JSON.stringify(reply)}`,()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.user(reply);assert.throws(()=>guard.consume(draft.id));});
test('correction and new draft invalidate previous confirmation',()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.user('yes');guard.prepare('Different rule.');assert.throws(()=>guard.consume(draft.id));});
test('interruption invalidates readback',()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.interrupt();guard.listening();guard.user('yes');assert.throws(()=>guard.consume(draft.id));});

test('correctness after a negated save request is not consent',()=>{const {guard,draft}=prepared();guard.agent(`Do not save this yet. ${sentence} Is that the correct wording?`);guard.listening();guard.user('Correct');assert.throws(()=>guard.consume(draft.id));});
test('a new unrelated agent turn cannot reuse old readback',()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.agent('Would you like another question?');guard.listening();guard.user('Yes');assert.throws(()=>guard.consume(draft.id));});
test('playback resuming revokes premature confirmation',()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.speaking();guard.user('Yes');assert.throws(()=>guard.consume(draft.id));});

for (const reply of ['Yes, save that.', 'Yes, share that.', 'Yes, please save that.', 'Yes, please save it.', 'Save that.', 'Share that.']) test(`accepts film phrase only after readback: ${reply}`,()=>{const {guard,draft}=prepared();guard.user(reply);assert.throws(()=>guard.consume(draft.id));guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.user(reply);assert.equal(guard.consume(draft.id),sentence);});
test('film phrase with trailing correction is not consent',()=>{const {guard,draft}=prepared();guard.agent(`${sentence} Shall I save that clarification with your name?`);guard.listening();guard.user('Yes, save that, but only after February.');assert.throws(()=>guard.consume(draft.id));});
