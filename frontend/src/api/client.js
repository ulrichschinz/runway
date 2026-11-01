import axios from 'axios'

import { loginHref } from '../shared/returnPath.js'
import { endsSession } from '../shared/sessionEnd.js'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (endsSession(err)) {
      localStorage.removeItem('token')
      // Keep where the visit was going (a Custom Tab's /next?task=…), as the router guard does.
      const { pathname, search, hash } = window.location
      window.location.href = loginHref(pathname + search + hash)
    }
    return Promise.reject(err)
  }
)

export default client
