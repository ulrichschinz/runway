import axios from 'axios'

import { lockSession, readToken } from '../shared/browserStorage.js'
import { loginHref } from '../shared/returnPath.js'
import { endsSession } from '../shared/sessionEnd.js'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = readToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (endsSession(err)) {
      // A lock, not a wipe (decision D6, ADR 0047): only the token goes. The account's queue and
      // draft wait under its namespace for the same account to sign in again.
      lockSession()
      // Keep where the visit was going (a Custom Tab's /next?task=…), as the router guard does.
      const { pathname, search, hash } = window.location
      window.location.href = loginHref(pathname + search + hash)
    }
    return Promise.reject(err)
  }
)

export default client
