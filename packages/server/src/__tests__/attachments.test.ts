import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { initDb, closeDb, insertAttachment, getAttachment, listAttachmentsByMessage, listAttachmentsBySession, deleteAttachment } from '../db/index.js';

const tenant = 'attach-test';
let n = 0;
const uid = () => `a-${Date.now()}-${++n}`;

describe('attachments', () => {
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ash-attach-'));
    await initDb({ dataDir: dir });
  });

  afterEach(async () => {
    await closeDb();
  });

  it('inserts and retrieves an attachment', async () => {
    const id = uid();
    const att = await insertAttachment(id, tenant, 'msg-1', 'sess-1', 'test.txt', 'text/plain', 42, '/path/to/test.txt');
    expect(att.id).toBe(id);
    expect(att.filename).toBe('test.txt');
    expect(att.mimeType).toBe('text/plain');
    expect(att.size).toBe(42);

    const got = await getAttachment(id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(id);
  });

  it('returns null for nonexistent attachment', async () => {
    const got = await getAttachment('nope');
    expect(got).toBeNull();
  });

  it('lists attachments by message', async () => {
    const a = uid(), b = uid();
    await insertAttachment(a, tenant, 'msg-1', 'sess-1', 'file1.txt', 'text/plain', 10, '/p1');
    await insertAttachment(b, tenant, 'msg-2', 'sess-1', 'file2.txt', 'text/plain', 20, '/p2');

    const forMsg1 = await listAttachmentsByMessage('msg-1', tenant);
    expect(forMsg1.length).toBe(1);
    expect(forMsg1[0].id).toBe(a);
  });

  it('lists attachments by session', async () => {
    const a = uid(), b = uid(), c = uid();
    await insertAttachment(a, tenant, 'msg-1', 'sess-1', 'f1.txt', 'text/plain', 10, '/p1');
    await insertAttachment(b, tenant, 'msg-2', 'sess-1', 'f2.txt', 'text/plain', 20, '/p2');
    await insertAttachment(c, tenant, 'msg-3', 'sess-2', 'f3.txt', 'text/plain', 30, '/p3');

    const forSess1 = await listAttachmentsBySession('sess-1', tenant);
    expect(forSess1.length).toBe(2);
  });

  it('deletes an attachment', async () => {
    const id = uid();
    await insertAttachment(id, tenant, 'msg-1', 'sess-1', 'del.txt', 'text/plain', 5, '/del');
    const deleted = await deleteAttachment(id);
    expect(deleted).toBe(true);
    const got = await getAttachment(id);
    expect(got).toBeNull();
  });
});
