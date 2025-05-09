export interface FileUploadResult {
  provider: string;
  location: string;
  key: string;
  size: number;
}

export interface FileDownloadResult {
  stream: any; // This will be a readable stream
  mimetype: string;
  size: number;
  fileName: string;
}

export interface StorageProvider {
  /**
   * Upload a file to cloud storage
   * @param file The file buffer to upload
   * @param key The key/path where the file should be stored
   * @param mimetype The MIME type of the file
   */
  uploadFile(file: Buffer, key: string, mimetype: string): Promise<FileUploadResult>;
  
  /**
   * Download a file from cloud storage
   * @param key The key/path of the file to download
   */
  downloadFile(key: string): Promise<FileDownloadResult>;
  
  /**
   * Delete a file from cloud storage
   * @param key The key/path of the file to delete
   */
  deleteFile(key: string): Promise<boolean>;
  
  /**
   * Check if the provider is currently available
   */
  isAvailable(): Promise<boolean>;
}