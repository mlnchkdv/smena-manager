import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmptyDatabase, resetWorkspaceStore } from '../../src/server/workspace-store.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import { createTrackedSession, getAccessProfiles } from '../../src/server/auth.js';

export async function memberSharingFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-member-sharing-'));
  const settings = {
    DATABASE_PATH: path.join(directory, 'workspace.json'),
    UPLOADS_PATH: path.join(directory, 'uploads'),
    SESSION_SECRET: 'local-member-sharing-test-secret-at-least-32-characters',
    SMENA_PUBLIC_LINKS_ENABLED: 'true',
    SMENA_PUBLIC_API_ENABLED: 'true',
    SMENA_PUBLIC_API_WRITE_ENABLED: 'true',
    SMENA_PUBLIC_API_UPLOADS_ENABLED: 'true',
    ACCESS_ID_LOGIN_ENABLED: 'true',
    ACCESS_IDS_JSON: JSON.stringify([
      { id: 'owner-profile', name: 'Test owner', email: 'owner@example.test', role: 'admin', accessId: 'local-sharing-owner', active: true },
      { id: 'member-profile', name: 'Test member', email: 'member@example.test', role: 'editor', accessId: 'local-sharing-member', active: true },
      { id: 'other-profile', name: 'Other member', email: 'other@example.test', role: 'editor', accessId: 'local-sharing-other', active: true },
    ]),
  };
  const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  resetStorageProvider();
  resetWorkspaceStore();
  const profiles = getAccessProfiles();
  const data = {
    ...createEmptyDatabase(),
    me: 'owner',
    ws: { name: 'Member access QA', url: 'member-qa' },
    projOrder: ['shared', 'private'],
    members: profiles.map((profile, index) => ({
      id: ['owner', 'member', 'other'][index],
      authProfileId: profile.id,
      name: profile.name,
      email: profile.email,
      role: index ? 'Member' : 'Owner',
      status: 'active',
    })),
    projects: [
      {
        id: 'shared',
        name: 'Shared project',
        members: ['owner', 'member', 'other'],
        fileFolders: [{ id: 'file-folder', name: 'Public file folder' }],
      },
      { id: 'private', name: 'Private project', access: 'private', members: ['owner'], fileFolders: [] },
    ],
    knowledgeFolders: [{ id: 'note-folder', name: 'Public note folder' }],
    knowledgeNotes: [
      {
        id: 'note',
        title: 'Member sharing / Публичная заметка',
        folderId: 'note-folder',
        formatted_markdown: '# Synthetic only\n\nMember access acceptance / Проверка участника.',
      },
    ],
    files: [
      {
        id: 'file',
        project: 'shared',
        folderId: 'file-folder',
        name: 'member.txt',
        storageName: 'member.txt',
        mimeType: 'text/plain',
        bytes: 16,
        by: 'member',
        at: new Date().toISOString(),
      },
      {
        id: 'private-file',
        project: 'private',
        name: 'private.txt',
        storageName: 'private.txt',
        mimeType: 'text/plain',
        bytes: 6,
        by: 'owner',
        at: new Date().toISOString(),
      },
    ],
  };
  const provider = getStorageProvider();
  if (provider.name !== 'local') throw new Error('Member sharing fixture requires isolated local storage.');
  await provider.uploadFile('member.txt', Buffer.from('0123456789abcdef'));
  await provider.uploadFile('private.txt', Buffer.from('secret'));
  await provider.saveDatabase(data);
  const sessions = await Promise.all(profiles.map(profile => createTrackedSession(profile, { get: () => '' }, 'access_id')));
  return {
    directory,
    profiles,
    sessions,
    async cleanup() {
      resetStorageProvider();
      resetWorkspaceStore();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith('smena-member-sharing-'))
        throw new Error('Unsafe fixture cleanup path.');
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
