import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api/v1' });
api.interceptors.request.use((c) => {
  const t = sessionStorage.getItem('access_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original?._retry &&
      sessionStorage.getItem('refresh_token')
    ) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refresh_token: sessionStorage.getItem('refresh_token'),
        });
        sessionStorage.setItem('access_token', data.access_token);
        sessionStorage.setItem('refresh_token', data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        sessionStorage.clear();
        location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
