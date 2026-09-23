/** @typedef {import('./contribute-api.js').VideoUploadAuth} VideoUploadAuth */

const PART_SIZE = 1024 * 1024;
const VIDEO_CONTENT_TYPE = 'video/mp4';
const NOTIFICATION_VALUE = btoa('{"Vod":{}}');

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
 * @param {Record<string, string>} query
 */
function queryString(query) {
  return Object.keys(query)
    .sort()
    .map((key) => (query[key] === '' ? key : `${key}=${query[key]}`))
    .join('&');
}

/**
 * @param {string} objectKey
 */
function objectUrl(auth, objectKey, query) {
  const encoded = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const search = query && Object.keys(query).length ? `?${queryString(query)}` : '';
  return `https://${auth.bucket}.${auth.endpoint}/${encoded}${search}`;
}

/**
 * @param {VideoUploadAuth} auth
 * @param {{
 *   method: string,
 *   contentType: string,
 *   query?: Record<string, string>,
 *   body?: Blob | string | null,
 * }} request
 * @returns {Promise<XMLHttpRequest>}
 */
async function signedOssRequest(auth, request) {
  const date = new Date().toUTCString();
  /** @type {Record<string, string>} */
  const ossHeaders = {
    'x-oss-date': date,
    'x-oss-notification': NOTIFICATION_VALUE,
  };
  if (auth.securityToken) ossHeaders['x-oss-security-token'] = auth.securityToken;

  const canonicalHeaders = `${Object.keys(ossHeaders)
    .sort()
    .map((key) => `${key}:${ossHeaders[key]}`)
    .join('\n')}\n`;
  const resourceQuery = request.query && Object.keys(request.query).length ? `?${queryString(request.query)}` : '';
  const resource = `/${auth.bucket}/${auth.objectKey}${resourceQuery}`;
  const canonical = `${request.method}\n\n${request.contentType}\n\n${canonicalHeaders}${resource}`;
  const signature = await hmacSha1Base64(auth.accessKeySecret, canonical);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(request.method, objectUrl(auth, auth.objectKey, request.query));
    xhr.setRequestHeader('Content-Type', request.contentType);
    xhr.setRequestHeader('Authorization', `OSS ${auth.accessKeyId}:${signature}`);
    Object.entries(ossHeaders).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
        return;
      }
      reject(new Error(`OSS 上传失败（${xhr.status}）：${xhr.responseText || xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('OSS 上传网络错误'));
    xhr.send(request.body ?? null);
  });
}

/**
 * @param {string} xml
 */
function uploadIdFromXml(xml) {
  const match = `${xml ?? ''}`.match(/<UploadId>([^<]+)<\/UploadId>/i);
  if (!match) throw new Error('OSS 未返回 UploadId');
  return match[1];
}

/**
 * 与官网 aliyun-upload-sdk 一致：1MB 分片，init/part/complete 都带 X-Oss-Notification。
 * @param {VideoUploadAuth} auth
 * @param {File} file
 * @param {(sent: number, total: number) => void} [onProgress]
 */
export async function uploadVideoToOss(auth, file, onProgress) {
  const { endpoint, bucket, objectKey, accessKeyId, accessKeySecret } = auth;
  if (!endpoint || !bucket || !objectKey || !accessKeyId || !accessKeySecret) {
    throw new Error('上传凭证不完整');
  }
  if (!file || file.size <= 0) {
    throw new Error('视频文件为空');
  }

  const init = await signedOssRequest(auth, {
    method: 'POST',
    contentType: VIDEO_CONTENT_TYPE,
    query: { uploads: '' },
  });
  const uploadId = uploadIdFromXml(init.responseText);
  const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE));
  /** @type {{ number: number, etag: string }[]} */
  const parts = [];
  let uploaded = 0;

  for (let index = 0; index < partCount; index += 1) {
    const start = index * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const blob = file.slice(start, end);
    const part = await signedOssRequest(auth, {
      method: 'PUT',
      contentType: VIDEO_CONTENT_TYPE,
      query: { partNumber: `${index + 1}`, uploadId },
      body: blob,
    });
    const etag = part.getResponseHeader('ETag') || part.getResponseHeader('etag');
    if (!etag) throw new Error('OSS 分片未返回 ETag');
    parts.push({ number: index + 1, etag });
    uploaded = end;
    onProgress?.(uploaded, file.size);
  }

  const completeXml = `<CompleteMultipartUpload>${parts
    .map((part) => `<Part><PartNumber>${part.number}</PartNumber><ETag>${part.etag}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  await signedOssRequest(auth, {
    method: 'POST',
    contentType: 'application/xml',
    query: { uploadId },
    body: completeXml,
  });
}
