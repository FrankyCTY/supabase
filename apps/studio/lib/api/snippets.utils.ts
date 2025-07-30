import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { SNIPPETS_DIR } from './snippets.constants'

/**
 * Generates a deterministic UUID v4 from a string input
 * @param input - The string to generate a UUID from
 * @returns A deterministic UUID v4 string
 */
export function generateDeterministicUuid(input: string): string {
  // Create a hash of the input string
  const hash = crypto.createHash('sha256').update(input).digest()

  // Create a deterministic random number generator using the hash as seed
  const rng = () => {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
      bytes[i] = hash[i % hash.length]
    }
    return Array.from(bytes)
  }

  // Generate UUID v4 using the deterministic RNG
  return uuidv4({ rng })
}

export const SnippetSchema = z.object({
  id: z.string(),
  inserted_at: z.string().default(new Date().toISOString()),
  updated_at: z.string().default(new Date().toISOString()),
  type: z.literal('sql'),
  name: z.string(),
  description: z.string().optional(),
  favorite: z.boolean().default(false),
  content: z.object({
    sql: z.string(),
    favorite: z.boolean(),
    content_id: z.string(),
    schema_version: z.literal('1.0'),
  }),
  visibility: z.union([
    z.literal('user'),
    z.literal('project'),
    z.literal('org'),
    z.literal('public'),
  ]),
  project_id: z.number().default(1),
  folder_id: z.string().nullable().default(null),
  owner_id: z.number(),
  owner: z
    .object({
      id: z.number(),
      username: z.string(),
    })
    .default({ id: 1, username: 'system' }),
  updated_by: z
    .object({
      id: z.number(),
      username: z.string(),
    })
    .default({ id: 1, username: 'system' }),
})

export const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner_id: z.number(),
  parent_id: z.string().nullable(),
  project_id: z.number(),
})

export type Snippet = z.infer<typeof SnippetSchema>
export type Folder = z.infer<typeof FolderSchema>

const buildSnippet = (filename: string, content: string) => {
  const snippet: Snippet = {
    id: generateDeterministicUuid(filename),
    inserted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    type: 'sql',
    name: filename.replace('.sql', ''),
    description: '',
    favorite: false,
    content: {
      sql: content, // Default content
      favorite: false,
      content_id: uuidv4(),
      schema_version: '1.0',
    },
    visibility: 'user',
    project_id: 0,
    folder_id: null,
    owner_id: 0,
    owner: { id: 0, username: 'system' },
    updated_by: { id: 0, username: 'system' },
  }

  return snippet
}

const buildFolder = (name: string) => {
  const folder: Folder = {
    id: generateDeterministicUuid(name),
    name: name,
    owner_id: 0,
    parent_id: null,
    project_id: 0,
  }

  return folder
}

/**
 * Ensures the snippets directory exists
 */
export async function ensureSnippetsDirectory() {
  try {
    await fs.access(SNIPPETS_DIR)
  } catch {
    await fs.mkdir(SNIPPETS_DIR, { recursive: true })
  }
}

/**
 * Reads all snippets from the filesystem
 */
export async function readAllSnippets(): Promise<Snippet[]> {
  await ensureSnippetsDirectory()
  const files = await fs.readdir(SNIPPETS_DIR)

  const snippets = await Promise.all(
    files
      .filter((file) => file.endsWith('.sql'))
      .map(async (file) => {
        const content = await fs.readFile(path.join(SNIPPETS_DIR, file), 'utf-8')
        return buildSnippet(file, content)
      })
  )

  return snippets
}

/**
 * Saves a snippet to the filesystem
 */
export async function saveSnippet(snippet: Snippet, projectRef: string): Promise<Snippet> {
  await ensureSnippetsDirectory()

  const snippetName = snippet.name
  const content = snippet.content.sql || ''

  const filePath = path.join(SNIPPETS_DIR, `${snippetName}.sql`)
  await fs.writeFile(filePath, JSON.stringify(content, null, 2))

  const result = buildSnippet(snippetName, content)
  return result
}

/**
 * Deletes a snippet from the filesystem
 */
export async function deleteSnippet(id: string): Promise<void> {
  const filePath = path.join(SNIPPETS_DIR, `${id}.json`)
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * Updates a snippet in the filesystem
 */
export async function updateSnippet(id: string, updates: Partial<Snippet>): Promise<Snippet> {
  await ensureSnippetsDirectory()

  // You have to read all snippets to find the one to update
  const snippets = await readAllSnippets()
  const foundSnippet = snippets.find((s) => s.id === id)
  if (!foundSnippet) {
    throw new Error(`Snippet with id ${id} not found`)
  }

  try {
    const snippetName = updates.name || foundSnippet.name
    const snippetContent = updates.content?.sql || foundSnippet.content.sql
    const filePath = path.join(SNIPPETS_DIR, `${snippetName}.sql`)

    await fs.writeFile(filePath, JSON.stringify(snippetContent, null, 2))
    const updatedSnippet = buildSnippet(snippetName, snippetContent)
    return updatedSnippet
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Snippet with id ${id} not found`)
    }
    throw error
  }
}

/**
 * Reads all folders from the filesystem
 */
export async function readFolders(): Promise<Folder[]> {
  await ensureSnippetsDirectory()
  const items = await fs.readdir(SNIPPETS_DIR, { withFileTypes: true })

  const folders = items
    .filter((item) => item.isDirectory())
    .map((item) => buildFolder(item.name, {}))

  return folders
}

/**
 * Creates a new folder as an actual directory
 */
export async function createFolder(folder: Omit<Folder, 'id'>): Promise<Folder> {
  await ensureSnippetsDirectory()

  const newFolder: Folder = { ...folder, id: uuidv4() }
  const folderPath = path.join(SNIPPETS_DIR, newFolder.name)

  await fs.mkdir(folderPath, { recursive: true })

  return newFolder
}

/**
 * Deletes a folder directory from the filesystem
 * @throws {Error} If the folder doesn't exist
 */
export async function deleteFolder(id: string): Promise<void> {
  await ensureSnippetsDirectory()

  const folders = await readFolders()
  console.log('Folders:', folders)
  const folder = folders.find((f) => f.id === id)

  if (!folder) {
    throw new Error(`Folder with id ${id} not found`)
  }

  const folderPath = path.join(SNIPPETS_DIR, folder.name)
  try {
    await fs.rmdir(folderPath, { recursive: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    // If folder doesn't exist, still throw the original error
    throw new Error(`Folder with id ${id} not found`)
  }
}
