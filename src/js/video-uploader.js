/** @typedef {import('./contribute-api.js').VideoUploadAuth} VideoUploadAuth */

/**
 * @param {string} key
 * @param {string} message
 */
async function hmacSha1Base64(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/**
 * Upload a video file to Aliyun OSS with STS credentials from get_upload_auth.
 * @param {VideoUploadAuth} auth
 * @param {File} file
 * @param {(sent: number, total: number) => void} [onProgress]
 */
export function uploadVideoToOss(auth, file, onProgress) {
  const { endpoint, bucket, objectKey, accessKeyId, accessKeySecret, securityToken } = auth;
  if (!endpoint || !bucket || !objectKey) {
    return Promise.reject(new Error('上传凭证不完整'));
  }
  if (!file || file.size <= 0) {
    return Promise.reject(new Error('视频文件为空'));
  }

  const date = new Date().toUTCString();
  const contentType = 'application/octet-stream';
  const tokenLine = securityToken ? `x-oss-security-token:${securityToken}` : '';
  const canonicalParts = ['PUT', '', contentType, date];
  if (tokenLine) canonicalParts.push(tokenLine);
  canonicalParts.push(`/${bucket}/${objectKey}`);
  const canonical = canonicalParts.join('\n');

  return hmacSha1Base64(accessKeySecret, canonical).then((signature) => {
    const url = `https://${bucket}.${endpoint}/${objectKey}`;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Date', date);
      xhr.setRequestHeader('Content-Type', contentType);
      if (securityToken) {
        xhr.setRequestHeader('x-oss-security-token', securityToken);
      }
      xhr.setRequestHeader('Authorization', `OSS ${accessKeyId}:${signature}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded, event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`OSS 上传失败（${xhr.status}）：${xhr.responseText || xhr.statusText}`));
      };
      xhr.onerror = () => reject(new Error('OSS 上传网络错误'));
      xhr.send(file);
    });
  });
}
