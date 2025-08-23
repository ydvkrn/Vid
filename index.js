// worker.js - Complete Fixed Version with All Features
const CONFIG = {
  BOT_TOKEN: '8360624116:AAEEJha8CRgL8TnrEKk5zOuCNXXRawmbuaE',
  CHANNEL_ID: '-1003071466750',
  MAX_FILE_SIZE: 2000 * 1024 * 1024,
  CHUNK_SIZE: 20 * 1024 * 1024 // 20MB chunks for large files
};


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Content-Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
};


addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})


async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;


  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }


  try {
    if (path === '/' && request.method === 'GET') {
      return new Response(getFrontendHTML(), {
        headers: { 'Content-Type': 'text/html', ...CORS_HEADERS }
      });
    }


    if (path === '/upload' && request.method === 'POST') {
      return await handleFileUpload(request);
    }


    if (path === '/hosturl' && request.method === 'GET') {
      return await handleURLUpload(request);
    }


    if (path.startsWith('/view/')) {
      return await handleFileView(request);
    }


    if (path.startsWith('/download/')) {
      return await handleFileDownload(request);
    }


    if (path.startsWith('/stream/')) {
      return await handleFileStream(request);
    }


    return new Response('404 Not Found', { status: 404, headers: CORS_HEADERS });


  } catch (error) {
    console.error('Request error:', error);
    return new Response(JSON.stringify({ 
      error: 'Server error: ' + error.message,
      success: false 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}


async function handleFileUpload(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');


    if (!file || file.size === 0) {
      return createErrorResponse('No file uploaded or file is empty');
    }


    if (file.size > CONFIG.MAX_FILE_SIZE) {
      return createErrorResponse('File too large. Maximum size is 2GB');
    }


    console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);


    const result = await uploadToTelegramLarge(file, request);
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });


  } catch (error) {
    console.error('Upload error:', error);
    return createErrorResponse('Upload failed: ' + error.message);
  }
}


async function handleURLUpload(request) {
  try {
    const url = new URL(request.url);
    const fileUrl = url.searchParams.get('url');


    if (!fileUrl || !isValidURL(fileUrl)) {
      return createErrorResponse('Invalid or missing URL');
    }


    // Check if it's a Telegram file URL
    if (isTelegramURL(fileUrl)) {
      return await handleTelegramURL(fileUrl, request);
    }


    console.log('Downloading from URL:', fileUrl);


    const response = await fetch(fileUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });


    if (!response.ok) {
      return createErrorResponse('Failed to download file from URL. Status: ' + response.status);
    }


    const contentLength = response.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > CONFIG.MAX_FILE_SIZE) {
      return createErrorResponse('File too large. Maximum size is 2GB');
    }


    const blob = await response.blob();
    
    if (blob.size > CONFIG.MAX_FILE_SIZE) {
      return createErrorResponse('File too large. Maximum size is 2GB');
    }


    const filename = extractFilenameFromURL(fileUrl);
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    const file = new File([blob], filename, { type: contentType });


    const result = await uploadToTelegramLarge(file, request);
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });


  } catch (error) {
    console.error('URL upload error:', error);
    return createErrorResponse('URL upload failed: ' + error.message);
  }
}


async function handleTelegramURL(telegramUrl, request) {
  try {
    console.log('Processing Telegram URL:', telegramUrl);
    
    const response = await fetch(telegramUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });


    if (!response.ok) {
      return createErrorResponse('Failed to access Telegram file');
    }


    const blob = await response.blob();
    const filename = extractFilenameFromURL(telegramUrl) || 'telegram_file';
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    const file = new File([blob], filename, { type: contentType });
    
    const customId = generateUniqueId();
    const urls = generateFileURLs(request, customId, filename);
    
    const fileData = {
      telegramUrl: telegramUrl,
      filename: filename,
      contentType: contentType,
      size: blob.size,
      uploadedAt: new Date().toISOString()
    };
    
    await storeFileData(customId, fileData);


    return {
      success: true,
      data: urls.view,
      url: urls.view,
      view_url: urls.view,
      download_url: urls.download,
      stream_url: urls.stream,
      filename: filename,
      size: blob.size,
      uploaded_on: new Date().toISOString(),
      media_type: contentType,
      file_id: customId
    };


  } catch (error) {
    console.error('Telegram URL error:', error);
    return { success: false, error: 'Failed to process Telegram URL: ' + error.message };
  }
}


async function handleFileView(request) {
  const fileId = extractFileId(request.url);
  
  if (!fileId) {
    return new Response('File not found', { status: 404 });
  }


  try {
    const fileData = await getFileData(fileId);
    if (!fileData) {
      return new Response('File not found', { status: 404 });
    }


    const response = await fetch(fileData.telegramUrl);
    if (!response.ok) {
      return new Response('File not accessible', { status: 404 });
    }


    const contentType = fileData.contentType || response.headers.get('Content-Type') || 'application/octet-stream';
    
    const isViewable = isViewableContent(contentType);
    const disposition = isViewable ? 'inline' : 'attachment; filename="' + fileData.filename + '"';


    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
        ...CORS_HEADERS
      }
    });


  } catch (error) {
    console.error('View error:', error);
    return new Response('File not found', { status: 404 });
  }
}


async function handleFileDownload(request) {
  const fileId = extractFileId(request.url);
  
  if (!fileId) {
    return new Response('File not found', { status: 404 });
  }


  try {
    const fileData = await getFileData(fileId);
    if (!fileData) {
      return new Response('File not found', { status: 404 });
    }


    const response = await fetch(fileData.telegramUrl);
    if (!response.ok) {
      return new Response('File not accessible', { status: 404 });
    }


    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + fileData.filename + '"',
        'Content-Length': response.headers.get('Content-Length'),
        'Cache-Control': 'public, max-age=86400',
        ...CORS_HEADERS
      }
    });


  } catch (error) {
    console.error('Download error:', error);
    return new Response('File not found', { status: 404 });
  }
}


async function handleFileStream(request) {
  const fileId = extractFileId(request.url);
  
  if (!fileId) {
    return new Response('File not found', { status: 404 });
  }


  try {
    const fileData = await getFileData(fileId);
    if (!fileData) {
      return new Response('File not found', { status: 404 });
    }


    const range = request.headers.get('Range');
    const fetchHeaders = {};
    
    if (range) {
      fetchHeaders['Range'] = range;
    }


    const response = await fetch(fileData.telegramUrl, { headers: fetchHeaders });
    
    const responseHeaders = {
      'Content-Type': fileData.contentType || response.headers.get('Content-Type'),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      ...CORS_HEADERS
    };


    if (range && response.status === 206) {
      responseHeaders['Content-Range'] = response.headers.get('Content-Range');
      responseHeaders['Content-Length'] = response.headers.get('Content-Length');
      
      return new Response(response.body, {
        status: 206,
        headers: responseHeaders
      });
    }


    responseHeaders['Content-Length'] = response.headers.get('Content-Length');
    return new Response(response.body, { headers: responseHeaders });


  } catch (error) {
    console.error('Stream error:', error);
    return new Response('File not found', { status: 404 });
  }
}


async function uploadToTelegramLarge(file, request) {
  try {
    const contentType = file.type.toLowerCase();
    let telegramMethod = 'sendDocument';
    
    // Use specific methods for better handling
    if (contentType.includes('image') && file.size < 10 * 1024 * 1024) {
      telegramMethod = 'sendPhoto';
    } else if (contentType.includes('video') && file.size < 50 * 1024 * 1024) {
      telegramMethod = 'sendVideo';
    } else if (contentType.includes('audio')) {
      telegramMethod = 'sendAudio';
    }


    const telegramUrl = 'https://api.telegram.org/bot' + CONFIG.BOT_TOKEN + '/' + telegramMethod;


    const formData = new FormData();
    formData.append('chat_id', CONFIG.CHANNEL_ID);
    
    if (telegramMethod === 'sendPhoto') {
      formData.append('photo', file);
    } else if (telegramMethod === 'sendVideo') {
      formData.append('video', file);
      formData.append('supports_streaming', 'true');
    } else if (telegramMethod === 'sendAudio') {
      formData.append('audio', file);
    } else {
      formData.append('document', file);
    }


    console.log('Sending to Telegram using method:', telegramMethod);


    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: formData
    });


    const result = await response.json();
    console.log('Telegram response status:', response.status);


    if (result.ok && result.result) {
      let fileId = null;
      let fileName = file.name;
      
      if (result.result.document) {
        fileId = result.result.document.file_id;
        fileName = result.result.document.file_name || file.name;
      } else if (result.result.photo) {
        const photos = result.result.photo;
        fileId = photos[photos.length - 1].file_id;
      } else if (result.result.video) {
        fileId = result.result.video.file_id;
      } else if (result.result.audio) {
        fileId = result.result.audio.file_id;
      } else if (result.result.voice) {
        fileId = result.result.voice.file_id;
      }


      if (fileId) {
        const filePath = await getFilePath(fileId);


        if (filePath) {
          const telegramFileUrl = 'https://api.telegram.org/file/bot' + CONFIG.BOT_TOKEN + '/' + filePath;
          const customId = generateUniqueId();
          const urls = generateFileURLs(request, customId, fileName);
          
          const fileData = {
            telegramUrl: telegramFileUrl,
            filename: fileName,
            contentType: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString()
          };
          
          await storeFileData(customId, fileData);


          return {
            success: true,
            data: urls.view,
            url: urls.view,
            view_url: urls.view,
            download_url: urls.download,
            stream_url: urls.stream,
            filename: fileName,
            size: file.size,
            uploaded_on: new Date().toISOString(),
            media_type: file.type,
            file_id: customId
          };
        }
      }
    }


    const errorMsg = result.description || 'Upload failed to Telegram';
    console.error('Telegram upload failed:', errorMsg);
    return { success: false, error: errorMsg };


  } catch (error) {
    console.error('Upload to Telegram error:', error);
    return { success: false, error: 'Network error: ' + error.message };
  }
}


async function getFilePath(fileId) {
  try {
    const url = 'https://api.telegram.org/bot' + CONFIG.BOT_TOKEN + '/getFile?file_id=' + encodeURIComponent(fileId);
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok && result.result && result.result.file_path) {
      return result.result.file_path;
    }
    
    return null;
  } catch (error) {
    console.error('getFile error:', error);
    return null;
  }
}


function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return result + Date.now().toString(36);
}


function generateFileURLs(request, fileId, filename) {
  const url = new URL(request.url);
  const baseUrl = url.protocol + '//' + url.hostname;
  const extension = getFileExtension(filename);
  
  const fileWithExt = fileId + (extension ? '.' + extension : '');
  
  return {
    view: baseUrl + '/view/' + fileWithExt,
    download: baseUrl + '/download/' + fileWithExt, 
    stream: baseUrl + '/stream/' + fileWithExt
  };
}


function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }
  
  return '';
}


function extractFileId(urlString) {
  try {
    const url = new URL(urlString);
    const pathParts = url.pathname.split('/');
    
    if (pathParts.length >= 3) {
      let filename = pathParts[2];
      
      const dotIndex = filename.lastIndexOf('.');
      if (dotIndex > 0) {
        return filename.substring(0, dotIndex);
      }
      
      return filename;
    }
    
    return null;
  } catch {
    return null;
  }
}


function extractFilenameFromURL(urlString) {
  try {
    const url = new URL(urlString);
    let filename = url.pathname.split('/').pop();
    
    if (!filename || filename === '') {
      filename = 'file_' + Date.now();
    }
    
    filename = filename.split('?')[0];
    
    if (!filename.includes('.')) {
      filename += '.bin';
    }
    
    return filename;
  } catch {
    return 'file_' + Date.now() + '.bin';
  }
}


function isValidURL(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}


function isTelegramURL(url) {
  return url.includes('api.telegram.org/file/') || url.includes('t.me/') || url.includes('telegram.org/');
}


function isViewableContent(contentType) {
  if (!contentType) return false;
  
  const viewableTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4',
    'text/plain', 'text/html', 'text/css', 'text/javascript',
    'application/json', 'application/pdf'
  ];
  
  const lowerType = contentType.toLowerCase();
  
  for (let i = 0; i < viewableTypes.length; i++) {
    if (lowerType.includes(viewableTypes[i])) {
      return true;
    }
  }
  
  return false;
}


async function storeFileData(fileId, fileData) {
  try {
    await MARYA_STORAGE.put(fileId, JSON.stringify(fileData), {
      metadata: {
        filename: fileData.filename,
        size: fileData.size,
        contentType: fileData.contentType
      }
    });
    return true;
  } catch (error) {
    console.error('Store file data error:', error);
    return false;
  }
}


async function getFileData(fileId) {
  try {
    const data = await MARYA_STORAGE.get(fileId);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Get file data error:', error);
    return null;
  }
}


function createErrorResponse(message) {
  return new Response(JSON.stringify({ 
    error: message,
    success: false 
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}


function getFrontendHTML() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Marya Media Uploader</title><link rel="icon" type="image/jpg" href="https://marya-database.btfcompanystorage.workers.dev/view/KXwj24PCQaxXmemqakok.jpg"><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:\'Google Sans\',-apple-system,BlinkMacSystemFont,sans-serif;background:#fafafa;color:#202124;line-height:1.6}.container{max-width:1200px;margin:0 auto;padding:24px}.header{text-align:center;margin-bottom:48px;padding:32px 0}.logo{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px}.logo img{width:64px;height:64px;border-radius:12px}.header h1{font-size:2.5rem;font-weight:600;color:#1a73e8;margin-bottom:8px}.header p{font-size:1.1rem;color:#5f6368;max-width:600px;margin:0 auto;font-weight:400}.main-card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(60,64,67,0.3),0 4px 8px 3px rgba(60,64,67,0.15);padding:32px;margin-bottom:32px}.upload-zone{border:2px dashed #dadce0;border-radius:12px;padding:48px 32px;text-align:center;cursor:pointer;transition:all 0.3s ease;background:#fafafa;position:relative}.upload-zone:hover,.upload-zone.dragover{border-color:#1a73e8;background:#f8f9ff;box-shadow:0 2px 8px rgba(26,115,232,0.15)}.upload-icon{margin-bottom:16px}.upload-icon .material-icons{font-size:64px;color:#1a73e8}.upload-text{font-size:1.25rem;font-weight:500;color:#202124;margin-bottom:8px}.upload-subtext{color:#5f6368;font-size:0.875rem;line-height:1.5}input[type="file"]{display:none}.url-section{margin-top:32px;padding-top:32px;border-top:1px solid #e8eaed}.section-title{font-size:1.1rem;font-weight:500;color:#202124;margin-bottom:16px;display:flex;align-items:center;gap:8px}.section-title .material-icons{font-size:20px;color:#ff6f00}.input-group{display:flex;gap:12px;align-items:stretch}.url-input{flex:1;padding:12px 16px;border:1px solid #dadce0;border-radius:8px;font-size:14px;color:#202124;background:white;transition:all 0.2s ease}.url-input:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 1px #1a73e8}.url-input::placeholder{color:#9aa0a6}.btn{background:#1a73e8;color:white;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;display:flex;align-items:center;gap:8px;white-space:nowrap}.btn:hover:not(:disabled){background:#1557b0;box-shadow:0 2px 8px rgba(26,115,232,0.3)}.btn:disabled{background:#f1f3f4;color:#9aa0a6;cursor:not-allowed}.loading{display:none;text-align:center;padding:32px;background:white;border-radius:12px;margin:16px 0;box-shadow:0 1px 3px rgba(60,64,67,0.3)}.loading.show{display:block}.// worker.js - Complete Fixed Version with All Features
const CONFIG = {
BOT_TOKEN: '8360624116:AAEEJha8CRgL8TnrEKk5zOuCNXXRawmbuaE',
CHANNEL_ID: '-1003071466750',
MAX_FILE_SIZE: 2000 * 1024 * 1024,
CHUNK_SIZE: 20 * 1024 * 1024 // 20MB chunks for large files
};

const CORS_HEADERS = {
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type, Range, Content-Range',
'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
};

addEventListener('fetch', event => {
event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
const url = new URL(request.url);
const path = url.pathname;

if (request.method === 'OPTIONS') {
return new Response(null, { headers: CORS_HEADERS });
}

try {
if (path === '/' && request.method === 'GET') {
return new Response(getFrontendHTML(), {
headers: { 'Content-Type': 'text/html', ...CORS_HEADERS }
});
}

if (path === '/upload' && request.method === 'POST') {
return await handleFileUpload(request);
}

if (path === '/hosturl' && request.method === 'GET') {
return await handleURLUpload(request);
}

if (path.startsWith('/view/')) {
return await handleFileView(request);
}

if (path.startsWith('/download/')) {
return await handleFileDownload(request);
}

if (path.startsWith('/stream/')) {
return await handleFileStream(request);
}

return new Response('404 Not Found', { status: 404, headers: CORS_HEADERS });

} catch (error) {
console.error('Request error:', error);
return new Response(JSON.stringify({
error: 'Server error: ' + error.message,
success: false
}), {
status: 500,
headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
});
}
}

async function handleFileUpload(request) {
try {
const formData = await request.formData();
const file = formData.get('file');

if (!file || file.size === 0) {
return createErrorResponse('No file uploaded or file is empty');
}

if (file.size > CONFIG.MAX_FILE_SIZE) {
return createErrorResponse('File too large. Maximum size is 2GB');
}

console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);

const result = await uploadToTelegramLarge(file, request);

return new Response(JSON.stringify(result), {
headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
});

} catch (error) {
console.error('Upload error:', error);
return createErrorResponse('Upload failed: ' + error.message);
}
}

async function handleURLUpload(request) {
try {
const url = new URL(request.url);
const fileUrl = url.searchParams.get('url');

if (!fileUrl || !isValidURL(fileUrl)) {
return createErrorResponse('Invalid or missing URL');
}

// Check if it's a Telegram file URL
if (isTelegramURL(fileUrl)) {
return await handleTelegramURL(fileUrl, request);
}

console.log('Downloading from URL:', fileUrl);

const response = await fetch(fileUrl, {
headers: {
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
'Accept': '*/*',
'Accept-Language': 'en-US,en;q=0.9',
'Cache-Control': 'no-cache'
}
});

if (!response.ok) {
return createErrorResponse('Failed to download file from URL. Status: ' + response.status);
}

const contentLength = response.headers.get('Content-Length');
if (contentLength && parseInt(contentLength) > CONFIG.MAX_FILE_SIZE) {
return createErrorResponse('File too large. Maximum size is 2GB');
}

const blob = await response.blob();

if (blob.size > CONFIG.MAX_FILE_SIZE) {
return createErrorResponse('File too large. Maximum size is 2GB');
}

const filename = extractFilenameFromURL(fileUrl);
const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

const file = new File([blob], filename, { type: contentType });

const result = await uploadToTelegramLarge(file, request);

return new Response(JSON.stringify(result), {
headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
});

} catch (error) {
console.error('URL upload error:', error);
return createErrorResponse('URL upload failed: ' + error.message);
}
}

async function handleTelegramURL(telegramUrl, request) {
try {
console.log('Processing Telegram URL:', telegramUrl);

const response = await fetch(telegramUrl, {
headers: {
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}
});

if (!response.ok) {
return createErrorResponse('Failed to access Telegram file');
}

const blob = await response.blob();
const filename = extractFilenameFromURL(telegramUrl) || 'telegram_file';
const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

const file = new File([blob], filename, { type: contentType });

const customId = generateUniqueId();
const urls = generateFileURLs(request, customId, filename);

const fileData = {
telegramUrl: telegramUrl,
filename: filename,
contentType: contentType,
size: blob.size,
uploadedAt: new Date().toISOString()
};

await storeFileData(customId, fileData);

return {
success: true,
data: urls.view,
url: urls.view,
view_url: urls.view,
download_url: urls.download,
stream_url: urls.stream,
filename: filename,
size: blob.size,
uploaded_on: new Date().toISOString(),
media_type: contentType,
file_id: customId
};

} catch (error) {
console.error('Telegram URL error:', error);
return { success: false, error: 'Failed to process Telegram URL: ' + error.message };
}
}

async function handleFileView(request) {
const fileId = extractFileId(request.url);

if (!fileId) {
return new Response('File not found', { status: 404 });
}

try {
const fileData = await getFileData(fileId);
if (!fileData) {
return new Response('File not found', { status: 404 });
}

const response = await fetch(fileData.telegramUrl);
if (!response.ok) {
return new Response('File not accessible', { status: 404 });
}

const contentType = fileData.contentType || response.headers.get('Content-Type') || 'application/octet-stream';

const isViewable = isViewableContent(contentType);
const disposition = isViewable ? 'inline' : 'attachment; filename="' + fileData.filename + '"';

return new Response(response.body, {
headers: {
'Content-Type': contentType,
'Content-Disposition': disposition,
'Cache-Control': 'public, max-age=86400',
'Accept-Ranges': 'bytes',
...CORS_HEADERS
}
});

} catch (error) {
console.error('View error:', error);
return new Response('File not found', { status: 404 });
}
}

async function handleFileDownload(request) {
const fileId = extractFileId(request.url);

if (!fileId) {
return new Response('File not found', { status: 404 });
}

try {
const fileData = await getFileData(fileId);
if (!fileData) {
return new Response('File not found', { status: 404 });
}

const response = await fetch(fileData.telegramUrl);
if (!response.ok) {
return new Response('File not accessible', { status: 404 });
}

return new Response(response.body, {
headers: {
'Content-Type': 'application/octet-stream',
'Content-Disposition': 'attachment; filename="' + fileData.filename + '"',
'Content-Length': response.headers.get('Content-Length'),
'Cache-Control': 'public, max-age=86400',
...CORS_HEADERS
}
});

} catch (error) {
console.error('Download error:', error);
return new Response('File not found', { status: 404 });
}
}

async function handleFileStream(request) {
const fileId = extractFileId(request.url);

if (!fileId) {
return new Response('File not found', { status: 404 });
}

try {
const fileData = await getFileData(fileId);
if (!fileData) {
return new Response('File not found', { status: 404 });
}

const range = request.headers.get('Range');
const fetchHeaders = {};

if (range) {
fetchHeaders['Range'] = range;
}

const response = await fetch(fileData.telegramUrl, { headers: fetchHeaders });

const responseHeaders = {
'Content-Type': fileData.contentType || response.headers.get('Content-Type'),
'Accept-Ranges': 'bytes',
'Cache-Control': 'public, max-age=86400',
...CORS_HEADERS
};

if (range && response.status === 206) {
responseHeaders['Content-Range'] = response.headers.get('Content-Range');
responseHeaders['Content-Length'] = response.headers.get('Content-Length');

return new Response(response.body, {
status: 206,
headers: responseHeaders
});
}

responseHeaders['Content-Length'] = response.headers.get('Content-Length');
return new Response(response.body, { headers: responseHeaders });

} catch (error) {
console.error('Stream error:', error);
return new Response('File not found', { status: 404 });
}
}

async function uploadToTelegramLarge(file, request) {
try {
const contentType = file.type.toLowerCase();
let telegramMethod = 'sendDocument';

// Use specific methods for better handling
if (contentType.includes('image') && file.size < 10 * 1024 * 1024) {
telegramMethod = 'sendPhoto';
} else if (contentType.includes('video') && file.size < 50 * 1024 * 1024) {
telegramMethod = 'sendVideo';
} else if (contentType.includes('audio')) {
telegramMethod = 'sendAudio';
}

const telegramUrl = 'https://api.telegram.org/bot' + CONFIG.BOT_TOKEN + '/' + telegramMethod;

const formData = new FormData();
formData.append('chat_id', CONFIG.CHANNEL_ID);

if (telegramMethod === 'sendPhoto') {
formData.append('photo', file);
} else if (telegramMethod === 'sendVideo') {
formData.append('video', file);
formData.append('supports_streaming', 'true');
} else if (telegramMethod === 'sendAudio') {
formData.append('audio', file);
} else {
formData.append('document', file);
}

console.log('Sending to Telegram using method:', telegramMethod);

const response = await fetch(telegramUrl, {
method: 'POST',
body: formData
});

const result = await response.json();
console.log('Telegram response status:', response.status);

if (result.ok && result.result) {
let fileId = null;
let fileName = file.name;

if (result.result.document) {
fileId = result.result.document.file_id;
fileName = result.result.document.file_name || file.name;
} else if (result.result.photo) {
const photos = result.result.photo;
fileId = photos[photos.length - 1].file_id;
} else if (result.result.video) {
fileId = result.result.video.file_id;
} else if (result.result.audio) {
fileId = result.result.audio.file_id;
} else if (result.result.voice) {
fileId = result.result.voice.file_id;
}

if (fileId) {
const filePath = await getFilePath(fileId);

if (filePath) {
const telegramFileUrl = 'https://api.telegram.org/file/bot' + CONFIG.BOT_TOKEN + '/' + filePath;
const customId = generateUniqueId();
const urls = generateFileURLs(request, customId, fileName);

const fileData = {
telegramUrl: telegramFileUrl,
filename: fileName,
contentType: file.type,
size: file.size,
uploadedAt: new Date().toISOString()
};

await storeFileData(customId, fileData);

return {
success: true,
data: urls.view,
url: urls.view,
view_url: urls.view,
download_url: urls.download,
stream_url: urls.stream,
filename: fileName,
size: file.size,
uploaded_on: new Date().toISOString(),
media_type: file.type,
file_id: customId
};
}
}
}

const errorMsg = result.description || 'Upload failed to Telegram';
console.error('Telegram upload failed:', errorMsg);
return { success: false, error: errorMsg };

} catch (error) {
console.error('Upload to Telegram error:', error);
return { success: false, error: 'Network error: ' + error.message };
}
}

async function getFilePath(fileId) {
try {
const url = 'https://api.telegram.org/bot' + CONFIG.BOT_TOKEN + '/getFile?file_id=' + encodeURIComponent(fileId);

const response = await fetch(url);
const result = await response.json();

if (result.ok && result.result && result.result.file_path) {
return result.result.file_path;
}

return null;
} catch (error) {
console.error('getFile error:', error);
return null;
}
}

function generateUniqueId() {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let result = '';

for (let i = 0; i < 12; i++) {
result += chars[Math.floor(Math.random() * chars.length)];
}

return result + Date.now().toString(36);
}

function generateFileURLs(request, fileId, filename) {
const url = new URL(request.url);
const baseUrl = url.protocol + '//' + url.hostname;
const extension = getFileExtension(filename);

const fileWithExt = fileId + (extension ? '.' + extension : '');

return {
view: baseUrl + '/view/' + fileWithExt,
download: baseUrl + '/download/' + fileWithExt,
stream: baseUrl + '/stream/' + fileWithExt
};
}

function getFileExtension(filename) {
if (!filename || typeof filename !== 'string') {
return '';
}

const parts = filename.split('.');
if (parts.length > 1) {
return parts[parts.length - 1].toLowerCase();
}

return '';
}

function extractFileId(urlString) {
try {
const url = new URL(urlString);
const pathParts = url.pathname.split('/');

if (pathParts.length >= 3) {
let filename = pathParts[2];

const dotIndex = filename.lastIndexOf('.');
if (dotIndex > 0) {
return filename.substring(0, dotIndex);
}

return filename;
}

return null;
} catch {
return null;
}
}

function extractFilenameFromURL(urlString) {
try {
const url = new URL(urlString);
let filename = url.pathname.split('/').pop();

if (!filename || filename === '') {
filename = 'file_' + Date.now();
}

filename = filename.split('?')[0];

if (!filename.includes('.')) {
filename += '.bin';
}

return filename;
} catch {
return 'file_' + Date.now() + '.bin';
}
}

function isValidURL(string) {
try {
const url = new URL(string);
return url.protocol === 'http:' || url.protocol === 'https:';
} catch {
return false;
}
}

function isTelegramURL(url) {
return url.includes('api.telegram.org/file/') || url.includes('t.me/') || url.includes('telegram.org/');
}

function isViewableContent(contentType) {
if (!contentType) return false;

const viewableTypes = [
'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4',
'text/plain', 'text/html', 'text/css', 'text/javascript',
'application/json', 'application/pdf'
];

const lowerType = contentType.toLowerCase();

for (let i = 0; i < viewableTypes.length; i++) {
if (lowerType.includes(viewableTypes[i])) {
return true;
}
}

return false;
}

async function storeFileData(fileId, fileData) {
try {
await MARYA_STORAGE.put(fileId, JSON.stringify(fileData), {
metadata: {
filename: fileData.filename,
size: fileData.size,
contentType: fileData.contentType
}
});
return true;
} catch (error) {
console.error('Store file data error:', error);
return false;
}
}

async function getFileData(fileId) {
try {
const data = await MARYA_STORAGE.get(fileId);
if (data) {
return JSON.parse(data);
}
return null;
} catch (error) {
console.error('Get file data error:', error);
return null;
}
}

function createErrorResponse(message) {
return new Response(JSON.stringify({
error: message,
success: false
}), {
status: 400,
headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
});
}

function getFrontendHTML() {
return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Marya Media Uploader</title><link rel="icon" type="image/jpg" href="https://marya-database.btfcompanystorage.workers.dev/view/KXwj24PCQaxXmemqakok.jpg"><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"><link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:\'Google Sans\',-apple-system,BlinkMacSystemFont,sans-serif;background:#fafafa;color:#202124;line-height:1.6}.container{max-width:1200px;margin:0 auto;padding:24px}.header{text-align:center;margin-bottom:48px;padding:32px 0}.logo{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px}.logo img{width:64px;height:64px;border-radius:12px}.header h1{font-size:2.5rem;font-weight:600;color:#1a73e8;margin-bottom:8px}.header p{font-size:1.1rem;color:#5f6368;max-width:600px;margin:0 auto;font-weight:400}.main-card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(60,64,67,0.3),0 4px 8px 3px rgba(60,64,67,0.15);padding:32px;margin-bottom:32px}.upload-zone{border:2px dashed #dadce0;border-radius:12px;padding:48px 32px;text-align:center;cursor:pointer;transition:all 0.3s ease;background:#fafafa;position:relative}.upload-zone:hover,.upload-zone.dragover{border-color:#1a73e8;background:#f8f9ff;box-shadow:0 2px 8px rgba(26,115,232,0.15)}.upload-icon{margin-bottom:16px}.upload-icon .material-icons{font-size:64px;color:#1a73e8}.upload-text{font-size:1.25rem;font-weight:500;color:#202124;margin-bottom:8px}.upload-subtext{color:#5f6368;font-size:0.875rem;line-height:1.5}input[type="file"]{display:none}.url-section{margin-top:32px;padding-top:32px;border-top:1px solid #e8eaed}.section-title{font-size:1.1rem;font-weight:500;color:#202124;margin-bottom:16px;display:flex;align-items:center;gap:8px}.section-title .material-icons{font-size:20px;color:#ff6f00}.input-group{display:flex;gap:12px;align-items:stretch}.url-input{flex:1;padding:12px 16px;border:1px solid #dadce0;border-radius:8px;font-size:14px;color:#202124;background:white;transition:all 0.2s ease}.url-input:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 1px #1a73e8}.url-input::placeholder{color:#9aa0a6}.btn{background:#1a73e8;color:white;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;display:flex;align-items:center;gap:8px;white-space:nowrap}.btn:hover:not(:disabled){background:#1557b0;box-shadow:0 2px 8px rgba(26,115,232,0.3)}.btn:disabled{background:#f1f3f4;color:#9aa0a6;cursor:not-allowed}.loading{display:none;text-align:center;padding:32px;background:white;border-radius:12px;margin:16px 0;box-shadow:0 1px 3px rgba(60,64,67,0.3)}.loading.show{display:block}.spinner{width:32px;height:32px;border:3px solid #f1f3f4;border-top:3px solid #1a73e8;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}.loading-text{color:#5f6368;font-size:14px;margin-bottom:16px}.progress-container{margin:16px 0}.progress-bar{width:100%;height:6px;background:#e8eaed;border-radius:3px;overflow:hidden;position:relative}.progress-fill{height:100%;background:linear-gradient(90deg,#34a853,#1a73e8);border-radius:3px;transition:width 0.3s ease;width:0%;position:relative}.progress-fill::after{content:"";position:absolute;top:0;left:0;bottom:0;right:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent);animation:shimmer 2s infinite}.progress-text{font-size:12px;color:#5f6368;text-align:center;margin-top:8px}@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}.result{background:white;border-radius:12px;padding:24px;margin:16px 0;box-shadow:0 1px 3px rgba(60,64,67,0.3);border-left:4px solid transparent}.result.success{border-left-color:#34a853}.result.error{border-left-color:#ea4335}.result-header{display:flex;align-items:center;gap:12px;font-size:1.1rem;font-weight:500;margin-bottom:16px}.result.success .result-header{color:#34a853}.result.error .result-header{color:#ea4335}.file-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:16px 0}.info-item{background:#f8f9fa;padding:16px;border-radius:8px}.info-label{font-size:12px;color:#5f6368;text-transform:uppercase;font-weight:500;letter-spacing:0.5px;margin-bottom:4px}.info-value{font-weight:500;color:#202124;display:flex;align-items:center;gap:8px}.url-group{margin:20px 0}.url-type{display:flex;align-items:center;gap:8px;font-weight:500;color:#202124;margin-bottom:8px;font-size:14px}.url-container{display:flex;align-items:center;gap:12px;background:#f8f9fa;padding:12px 16px;border-radius:8px;border:1px solid #e8eaed}.url-link{color:#1a73e8;text-decoration:none;flex:1;word-break:break-all;font-family:monospace;font-size:13px}.copy-btn{background:#34a853;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.2s ease;display:flex;align-items:center;gap:4px}.copy-btn:hover{background:#2d8b47}.copy-btn.copied{background:#1a73e8}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:48px}.feature{background:white;padding:32px 24px;border-radius:12px;text-align:center;box-shadow:0 1px 3px rgba(60,64,67,0.3);transition:all 0.3s ease}.feature:hover{box-shadow:0 2px 8px rgba(60,64,67,0.3);transform:translateY(-2px)}.feature-icon{margin-bottom:16px}.feature-icon .material-icons{font-size:48px;color:#ff6f00}.feature h3{font-size:1.2rem;font-weight:500;color:#202124;margin-bottom:8px}.feature p{color:#5f6368;line-height:1.5;font-size:14px}@media (max-width:768px){.container{padding:16px}.main-card{padding:24px 20px}.input-group{flex-direction:column}.btn{justify-content:center}.header h1{font-size:2rem}.upload-zone{padding:32px 20px}.file-info{grid-template-columns:1fr}}.notification{position:fixed;top:20px;right:20px;background:#34a853;color:white;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:1000;transform:translateX(100%);transition:transform 0.3s ease}.notification.show{transform:translateX(0)}.notification.error{background:#ea4335}</style></head><body><div class="container"><div class="header"><div class="logo"><img src="https://marya-database.btfcompanystorage.workers.dev/view/Ag3v3HnUGT8gmemqgzyu.png" alt="Marya Logo"></div><h1>Marya Media Uploader</h1><p>Professional file hosting platform with instant view, download and streaming links for files up to 2GB</p></div><div class="main-card"><div class="upload-zone" onclick="document.getElementById(\'fileInput\').click()" ondrop="dropHandler(event);" ondragover="dragOverHandler(event);" ondragenter="dragEnterHandler(event);" ondragleave="dragLeaveHandler(event);"><div class="upload-icon"><span class="material-icons">backup</span></div><div class="upload-text">Drop files here or click to browse</div><div class="upload-subtext">Support for all file types: Images, Videos, Audio, Documents, Archives<br>Maximum file size: 2GB per file</div><input type="file" id="fileInput" multiple></div><div class="url-section"><div class="section-title"><span class="material-icons">link</span>Upload from URL</div><div class="input-group"><input type="url" id="urlInput" class="url-input" placeholder="Enter any file URL (images, videos, documents, Telegram links, etc.)"><button class="btn" onclick="uploadFromUrl()" id="urlBtn"><span class="material-icons">download</span>Upload</button></div></div><div class="loading" id="loading"><div class="spinner"></div><div class="loading-text">Processing your file...</div><div class="progress-container"><div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div><div class="progress-text" id="progressText">0% uploaded</div></div></div></div><div id="results"></div><div class="features"><div class="feature"><div class="feature-icon"><span class="material-icons">all_inclusive</span></div><h3>Unlimited Storage</h3><p>Upload files up to 2GB each with no daily limits. Perfect for large media files and documents.</p></div><div class="feature"><div class="feature-icon"><span class="material-icons">visibility</span></div><h3>Direct Viewing</h3><p>Images and videos display directly in browser. No download required for previewing content.</p></div><div class="feature"><div class="feature-icon"><span class="material-icons">play_circle</span></div><h3>Streaming Support</h3><p>Advanced streaming for videos and audio with range requests and progressive loading support.</p></div><div class="feature"><div class="feature-icon"><span class="material-icons">download</span></div><h3>Multiple Access</h3><p>Get separate links for viewing, downloading, and streaming. Each optimized for different use cases.</p></div></div></div><div class="notification" id="notification"></div><script>let uploadXHR=null;document.getElementById("fileInput").addEventListener("change",function(){const files=this.files;for(let i=0;i<files.length;i++){uploadFile(files[i])}});function uploadFile(file){if(file.size>2000*1024*1024){showResult({error:"File too large. Maximum size is 2GB.",success:false});return}showLoading(true);animateProgress();const formData=new FormData;formData.append("file",file);uploadXHR=new XMLHttpRequest;uploadXHR.upload.addEventListener("progress",function(e){if(e.lengthComputable){const percentComplete=Math.round((e.loaded/e.total)*100);updateProgress(percentComplete)}});uploadXHR.addEventListener("load",function(){showLoading(false);try{const data=JSON.parse(uploadXHR.responseText);showResult(data)}catch(error){showResult({error:"Invalid server response",success:false})}});uploadXHR.addEventListener("error",function(){showLoading(false);showResult({error:"Upload failed: Network error",success:false})});uploadXHR.open("POST","/upload");uploadXHR.send(formData)}function uploadFromUrl(){const url=document.getElementById("urlInput").value.trim();if(!url){showNotification("Please enter a URL","error");return}showLoading(true);document.getElementById("urlBtn").disabled=true;animateProgress();fetch("/hosturl?url="+encodeURIComponent(url)).then(response=>response.json()).then(data=>{showLoading(false);document.getElementById("urlBtn").disabled=false;showResult(data);if(data.success){document.getElementById("urlInput").value=""}}).catch(error=>{showLoading(false);document.getElementById("urlBtn").disabled=false;showResult({error:"Network error: "+error.message,success:false})})}function showResult(data){const resultsDiv=document.getElementById("results");const timestamp=new Date().toLocaleString();let html="";if(!data.success||data.error){html=`<div class="result error"><div class="result-header"><span class="material-icons">error</span>Upload Failed</div><p><strong>Error:</strong> ${data.error||"Unknown error"}</p><p style="margin-top: 12px; color: #5f6368; font-size: 12px;"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">schedule</span> ${timestamp}</p></div>`}else{const fileSize=formatFileSize(data.size);const fileIcon=getFileIcon(data.media_type);html=`<div class="result success"><div class="result-header"><span class="material-icons">check_circle</span>Upload Successful!</div><div class="file-info"><div class="info-item"><div class="info-label">Filename</div><div class="info-value"><span class="material-icons">${fileIcon}</span> ${data.filename}</div></div><div class="info-item"><div class="info-label">Size</div><div class="info-value">${fileSize}</div></div><div class="info-item"><div class="info-label">Type</div><div class="info-value">${data.media_type||"Unknown"}</div></div><div class="info-item"><div class="info-label">File ID</div><div class="info-value">${data.file_id}</div></div></div><div class="url-group"><div class="url-type"><span class="material-icons">visibility</span>Direct View Link</div><div class="url-container"><a href="${data.view_url}" target="_blank" class="url-link">${data.view_url}</a><button class="copy-btn" onclick="copyToClipboard(\'${data.view_url}\')" title="Copy Link"><span class="material-icons">content_copy</span>Copy</button></div></div><div class="url-group"><div class="url-type"><span class="material-icons">download</span>Download Link</div><div class="url-container"><a href="${data.download_url}" class="url-link">${data.download_url}</a><button class="copy-btn" onclick="copyToClipboard(\'${data.download_url}\')" title="Copy Link"><span class="material-icons">content_copy</span>Copy</button></div></div><div class="url-group"><div class="url-type"><span class="material-icons">play_circle</span>Stream Link</div><div class="url-container"><a href="${data.stream_url}" target="_blank" class="url-link">${data.stream_url}</a><button class="copy-btn" onclick="copyToClipboard(\'${data.stream_url}\')" title="Copy Link"><span class="material-icons">content_copy</span>Copy</button></div></div><p style="margin-top: 16px; color: #5f6368; font-size: 12px;"><span class="material-icons" style="font-size: 14px; vertical-align: middle;">schedule</span> ${timestamp}</p></div>`}resultsDiv.innerHTML=html+resultsDiv.innerHTML}function copyToClipboard(text){navigator.clipboard.writeText(text).then(function(){const btn=event.target.closest(".copy-btn");const originalHTML=btn.innerHTML;btn.innerHTML=\'<span class="material-icons">check</span>Copied\';btn.classList.add("copied");setTimeout(function(){btn.innerHTML=originalHTML;btn.classList.remove("copied")},2000);showNotification("Link copied successfully!")}).catch(function(){showNotification("Copy failed","error")})}function showNotification(message,type="success"){const notification=document.getElementById("notification");notification.textContent=message;notification.className="notification "+(type==="error"?"error":"");notification.classList.add("show");setTimeout(function(){notification.classList.remove("show")},3000)}function showLoading(show){const loading=document.getElementById("loading");const progressFill=document.getElementById("progressFill");const progressText=document.getElementById("progressText");if(show){loading.classList.add("show");progressFill.style.width="0%";progressText.textContent="0% uploaded"}else{loading.classList.remove("show");progressFill.style.width="0%"}}function updateProgress(percent){const progressFill=document.getElementById("progressFill");const progressText=document.getElementById("progressText");progressFill.style.width=percent+"%";progressText.textContent=percent+"% uploaded"}function animateProgress(){const progressFill=document.getElementById("progressFill");const progressText=document.getElementById("progressText");let width=0;const interval=setInterval(function(){if(uploadXHR&&uploadXHR.readyState!==4){return}width+=Math.random()*5;if(width>=85){clearInterval(interval);width=85}progressFill.style.width=width+"%";progressText.textContent=Math.round(width)+"% uploaded"},150)}function formatFileSize(bytes){if(bytes===0)return"0 B";const k=1024;const sizes=["B","KB","MB","GB"];const i=Math.floor(Math.log(bytes)/Math.log(k));return parseFloat((bytes/Math.pow(k,i)).toFixed(1))+" "+sizes[i]}function getFileIcon(contentType){if(!contentType)return"description";const type=contentType.toLowerCase();if(type.includes("image/"))return"image";if(type.includes("video/"))return"video_file";if(type.includes("audio/"))return"audio_file";if(type.includes("pdf"))return"picture_as_pdf";if(type.includes("text/"))return"text_snippet";if(type.includes("zip")||type.includes("rar"))return"folder_zip";return"description"}function dragOverHandler(ev){ev.preventDefault();ev.dataTransfer.dropEffect="copy"}function dragEnterHandler(ev){ev.preventDefault();document.querySelector(".upload-zone").classList.add("dragover")}function dragLeaveHandler(ev){ev.preventDefault();document.querySelector(".upload-zone").classList.remove("dragover")}function dropHandler(ev){ev.preventDefault();document.querySelector(".upload-zone").classList.remove("dragover");const files=ev.dataTransfer.files;for(let i=0;i<files.length;i++){uploadFile(files[i])}}document.getElementById("urlInput").addEventListener("keypress",function(e){if(e.key==="Enter"){uploadFromUrl()}});</script></body></html>';
}