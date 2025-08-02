interface Options {
  recursive: boolean;
}

export interface FilesWithPath {
  file: File;
  path: string;
}

// IndexedDB helper functions for storing directory handles
const DB_NAME = 'FolderAccessDB';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';
const HANDLE_KEY = 'lastSelectedFolder';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const saveDirectoryHandle = async (
  handle: FileSystemDirectoryHandle,
): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(handle, HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getStoredDirectoryHandle =
  async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(HANDLE_KEY);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.warn('Failed to retrieve stored directory handle:', error);
      return null;
    }
  };

const verifyPermission = async (
  handle: FileSystemDirectoryHandle,
): Promise<boolean> => {
  // Check if we already have permission
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') {
    return true;
  }

  // Request permission
  if ((await handle.requestPermission({ mode: 'read' })) === 'granted') {
    return true;
  }

  return false;
};

const getFiles = async (
  dirHandle: FileSystemDirectoryHandle,
  recursive: boolean,
  path: string = dirHandle.name,
): Promise<FilesWithPath[]> => {
  const dirs: Promise<FilesWithPath[]>[] = [];
  const files: FilesWithPath[] = [];

  for await (const entry of dirHandle.values()) {
    const nestedPath = `${path}/${entry.name}`;
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      files.push({
        file: file,
        path: nestedPath,
      });
    } else if (entry.kind === 'directory' && recursive) {
      dirs.push(getFiles(entry, recursive, nestedPath));
    }
  }

  const resolvedDirs = await Promise.all(dirs);
  return [...resolvedDirs.flat(), ...files];
};

export default async (
  options: Options,
): Promise<FilesWithPath[] | undefined> => {
  if (!('showDirectoryPicker' in window) || !window.showDirectoryPicker) {
    alert(
      "Your browser doesn't support the Filesystem Access API. You will have to make ZIP file out of your game directory, please click on the instructions link in the sidebar menu for a guide.",
    );
    return;
  }

  debugger;

  options.recursive = options.recursive || false;

  let handle: FileSystemDirectoryHandle | null = null;

  // Try to get the previously stored directory handle
  const storedHandle = await getStoredDirectoryHandle();

  if (storedHandle) {
    // Verify we still have permission to access the stored folder
    if (await verifyPermission(storedHandle)) {
      handle = storedHandle;
      console.info('Using previously selected folder:', handle.name);
    } else {
      console.info(
        'Permission denied for stored folder, will prompt for new selection',
      );
    }
  }

  // If no stored handle or permission was denied, show directory picker
  if (!handle) {
    try {
      // @ts-ignore -- showDirectoryPicker does exist in supported browsers
      handle = await window.showDirectoryPicker();

      if (handle) {
        // Save the new handle for future use
        await saveDirectoryHandle(handle);

        console.info('New folder selected and saved:', handle.name);

        return await getFiles(handle, options.recursive);
      }
    } catch (error) {
      alert(
        "Your browser doesn't support the Filesystem Access API. You will have to make ZIP file out of your game directory, please click on the instructions link in the sidebar menu for a guide.",
      );
      // User cancelled the picker or another error occurred
      console.warn('Directory selection cancelled or failed:', error);
      return;
    }
  }
};

export const clearStoredFolder = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('Stored folder handle cleared');
        resolve();
      };
    });
  } catch (error) {
    console.warn('Failed to clear stored directory handle:', error);
  }
};


// interface Options {
//   recursive: boolean;
// }
//
// export interface FilesWithPath {
//   file: File;
//   path: string;
// }
//
// const getFiles = async (
//   dirHandle: any,
//   recursive: boolean,
//   path: string = dirHandle.name,
// ): Promise<FilesWithPath[]> => {
//   const dirs: Promise<FilesWithPath[]>[] = [];
//   const files: FilesWithPath[] = [];
//
//   for await (const entry of dirHandle.values()) {
//     const nestedPath = `${path}/${entry.name}`;
//     if (entry.kind === 'file') {
//       const file = await entry.getFile();
//       files.push({
//         file: file,
//         path: nestedPath,
//       });
//     } else if (entry.kind === 'directory' && recursive) {
//       dirs.push(getFiles(entry, recursive, nestedPath));
//     }
//   }
//
//   const resolvedDirs = await Promise.all(dirs);
//   return [...resolvedDirs.flat(), ...files];
// };
//
// export default async (options: Options): Promise<FilesWithPath[] | undefined> => {
//   if (!('showDirectoryPicker' in window) || !window.showDirectoryPicker) {
//     alert('Your browser doesn\'t support the Filesystem Access API. You will have to make ZIP file out of your game directory, please click on the instructions link in the sidebar menu for a guide.');
//     return;
//   }
//   options.recursive = options.recursive || false;
//   // @ts-ignore -- it does exist
//   const handle = await window.showDirectoryPicker();
//   return await getFiles(handle, options.recursive);
// };
