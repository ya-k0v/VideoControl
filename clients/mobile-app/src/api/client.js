import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000' 
  : 'https://api.videocontrol.example.com';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, try to refresh
      await AsyncStorage.removeItem('accessToken');
      // Redirect to login
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// API functions
export const auth = {
  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },
  
  logout: async () => {
    await apiClient.post('/auth/logout');
    await AsyncStorage.removeItem('accessToken');
  },
  
  getCurrentUser: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};

export const devices = {
  getAll: async () => {
    const response = await apiClient.get('/api/devices');
    return response.data;
  },
  
  getById: async (deviceId) => {
    const response = await apiClient.get(`/api/devices/${deviceId}`);
    return response.data;
  },
  
  create: async (deviceData) => {
    const response = await apiClient.post('/api/devices', deviceData);
    return response.data;
  },
  
  delete: async (deviceId) => {
    await apiClient.delete(`/api/devices/${deviceId}`);
  },
};

export const files = {
  getByDevice: async (deviceId) => {
    const response = await apiClient.get(`/api/devices/${deviceId}/files`);
    return response.data;
  },
  
  upload: async (deviceId, file, onProgress) => {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    });
    
    const response = await apiClient.post(
      `/api/devices/${deviceId}/files`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentage = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress?.(percentage);
        },
      }
    );
    return response.data;
  },
  
  delete: async (deviceId, fileName) => {
    await apiClient.delete(`/api/devices/${deviceId}/files/${fileName}`);
  },
};

export const playlists = {
  getAll: async () => {
    const response = await apiClient.get('/api/playlists');
    return response.data;
  },
  
  create: async (playlistData) => {
    const response = await apiClient.post('/api/playlists', playlistData);
    return response.data;
  },
  
  update: async (playlistId, playlistData) => {
    const response = await apiClient.put(`/api/playlists/${playlistId}`, playlistData);
    return response.data;
  },
  
  delete: async (playlistId) => {
    await apiClient.delete(`/api/playlists/${playlistId}`);
  },
};

