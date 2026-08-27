import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALLOWLISTED_EMAILS, isAllowlisted } from './allowlist';

describe('Allowlist Sync & Consistency', () => {
  it('correctly validates allowlisted emails and rejects unauthorized ones', () => {
    assert.equal(isAllowlisted('philip@amwatatech.com'), true);
    assert.equal(isAllowlisted('PHILIP@AMWATATECH.COM'), true);
    assert.equal(isAllowlisted('chiarawitry5@gmail.com'), true);
    assert.equal(isAllowlisted('ChiaraWitry5@Gmail.Com'), true);
    assert.equal(isAllowlisted('unauthorized@example.com'), false);
    assert.equal(isAllowlisted(null), false);
    assert.equal(isAllowlisted(undefined), false);
    assert.equal(isAllowlisted(''), false);
  });

  it('keeps firestore.rules allowlist synchronized with functions/src/config/allowlist.ts', () => {
    const firestoreRulesPath = path.resolve(__dirname, '../../../firestore.rules');
    assert.ok(fs.existsSync(firestoreRulesPath), `firestore.rules not found at ${firestoreRulesPath}`);

    const content = fs.readFileSync(firestoreRulesPath, 'utf-8');
    for (const email of ALLOWLISTED_EMAILS) {
      assert.ok(
        content.includes(`'${email}'`),
        `firestore.rules is missing allowlisted email: '${email}'`
      );
    }
  });

  it('keeps storage.rules allowlist synchronized with functions/src/config/allowlist.ts', () => {
    const storageRulesPath = path.resolve(__dirname, '../../../storage.rules');
    assert.ok(fs.existsSync(storageRulesPath), `storage.rules not found at ${storageRulesPath}`);

    const content = fs.readFileSync(storageRulesPath, 'utf-8');
    for (const email of ALLOWLISTED_EMAILS) {
      assert.ok(
        content.includes(`'${email}'`),
        `storage.rules is missing allowlisted email: '${email}'`
      );
    }
  });

  it('keeps frontend authentication.service.ts allowlist synchronized', () => {
    const authServicePath = path.resolve(
      __dirname,
      '../../../src/app/services/authentication.service.ts'
    );
    assert.ok(fs.existsSync(authServicePath), `authentication.service.ts not found at ${authServicePath}`);

    const content = fs.readFileSync(authServicePath, 'utf-8');
    for (const email of ALLOWLISTED_EMAILS) {
      assert.ok(
        content.includes(`'${email}'`),
        `authentication.service.ts is missing allowlisted email: '${email}'`
      );
    }
  });
});
