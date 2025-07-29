import { paths } from 'api-types'
import apiWrapper from 'lib/api/apiWrapper'
import { NextApiRequest, NextApiResponse } from 'next'
import { createFolder, deleteFolder, readAllSnippets, readFolders } from '../_helpers'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    case 'POST':
      return handlePost(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

type GetResponseData =
  paths['/platform/projects/{ref}/content/folders']['get']['responses']['200']['content']['application/json']

type GetRequestData =
  paths['/platform/projects/{ref}/content/folders']['get']['parameters']['query']

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse<GetResponseData>) => {
  const folders = await readFolders()
  const snippets = (await readAllSnippets()).filter((s) => s.folder_id === null)

  res.status(200).json({ data: { folders, contents: snippets } })
}

type PostResponseData =
  paths['/platform/projects/{ref}/content/folders']['post']['responses']['201']['content']['application/json']

type PostRequestData =
  paths['/platform/projects/{ref}/content/folders']['post']['requestBody']['content']['application/json']
const handlePost = async (req: NextApiRequest, res: NextApiResponse<PostResponseData>) => {
  const { name, parent_id } = req.body as PostRequestData

  const folder = await createFolder({
    name,
    parent_id: parent_id || null,
    owner_id: 1,
    project_id: 1,
  })

  return res.status(200).json(folder)
}

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query
  await deleteFolder(id as string)

  return res.status(200).json({})
}
