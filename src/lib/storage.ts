/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {Database} from '../config/databases';
import {MOUNT_CLASS_TO} from '../config/debug';
// import DATABASE_SESSION from "../config/databases/session";
import deferredPromise, {CancellablePromise} from '../helpers/cancellablePromise';
import {IS_WORKER} from '../helpers/context';
import throttleWith from '../helpers/schedulers/throttleWith';
// import { WorkerTaskTemplate } from "../types";
import IDBStorage from './files/idb';
import {logger} from './logger';

function noop() {}

/* export interface LocalStorageProxySetTask extends WorkerTaskTemplate {
  type: 'localStorageProxy',
  payload: {
    type: 'set',
    keys: string[],
    values: any[]
  }
};

export interface LocalStorageProxyDeleteTask extends WorkerTaskTemplate {
  type: 'localStorageProxy',
  payload: {
    type: 'delete',
    keys: string[]
  }
}; */

const THROTTLE_TIME = 16;

/* Storage extends {[name: string]: any} *//* Storage extends Record<string, any> */
export default class AppStorage<
  Storage extends Record<string, any>,
  T extends Database<any>
> {
  private static STORAGES: AppStorage<any, Database<any>>[] = [];
  private storage: IDBStorage<T>;// new CacheStorageController('session');

  // private cache: Partial<{[key: string]: Storage[typeof key]}> = {};
  private cache: Partial<Storage>;
  private useStorage: boolean;
  private savingFreezed: boolean;

  private getPromises: Map<keyof Storage, CancellablePromise<Storage[keyof Storage]>>;
  private getThrottled: () => void;

  private keysToSet: Set<keyof Storage>;
  private saveThrottled: () => void;
  private saveDeferred: CancellablePromise<void>;

  private keysToDelete: Set<keyof Storage>;
  private deleteThrottled: () => void;
  private deleteDeferred: CancellablePromise<void>;

  private log: ReturnType<typeof logger>;

  constructor(private db: T, private storeName: typeof db['stores'][number]['name']) {
    this.storage = new IDBStorage<T>(db, storeName);
    this.log = logger(`AS-${db.name}-${storeName}`);

    this.cache = {};
    this.getPromises = new Map();
    this.keysToSet = new Set();
    this.saveDeferred = deferredPromise();
    this.keysToDelete = new Set();
    this.deleteDeferred = deferredPromise();

    if(AppStorage.STORAGES.length) {
      this.useStorage = AppStorage.STORAGES[0].useStorage;
    } else {
      this.useStorage = true;
    }

    this.savingFreezed = false;

    AppStorage.STORAGES.push(this);

    this.saveThrottled = throttleWith(queueMicrotask, this._save, /* THROTTLE_TIME,  */false);
    this.deleteThrottled = throttleWith(queueMicrotask, this._delete, /* THROTTLE_TIME,  */false);
    this.getThrottled = throttleWith(queueMicrotask, this._get, /* THROTTLE_TIME,  */false);
  }

  private _save = async() => {
    const deferred = this.saveDeferred;
    this.saveDeferred = deferredPromise();

    const set = this.keysToSet;
    if(set.size) {
      const keys = Array.from(set.values()) as string[];
      set.clear();

      const values = keys.map((key) => this.cache[key]);
      try {
        // console.log('setItem: will set', key/* , value */);
        // await this.cacheStorage.delete(key); // * try to prevent memory leak in Chrome leading to 'Unexpected internal error.'
        // await this.storage.save(key, new Response(value, {headers: {'Content-Type': 'application/json'}}));

        /* if(db === DATABASE_SESSION && !('localStorage' in self)) { // * support legacy Webogram's localStorage
          self.postMessage({
            type: 'localStorageProxy',
            payload: {
              type: 'set',
              keys,
              values
            }
          } as LocalStorageProxySetTask);
        } */

        await this.storage.save(keys, values);
        // console.log('setItem: have set', key/* , value */);
      } catch(e) {
        // this.useCS = false;
        this.log.error('set error', e, keys, values);
      }
    }

    deferred.resolve();

    if(set.size) {
      this.saveThrottled();
    }
  };

  private _delete = async() => {
    const deferred = this.deleteDeferred;
    this.deleteDeferred = deferredPromise();

    const set = this.keysToDelete;
    if(set.size) {
      const keys = Array.from(set.values()) as string[];
      set.clear();

      try {
        /* if(db === DATABASE_SESSION && !('localStorage' in self)) { // * support legacy Webogram's localStorage
          self.postMessage({
            type: 'localStorageProxy',
            payload: {
              type: 'delete',
              keys
            }
          } as LocalStorageProxyDeleteTask);
        } */

        await this.storage.delete(keys);
      } catch(e) {
        this.log.error('delete error', e, keys);
      }
    }

    deferred.resolve();

    if(set.size) {
      this.deleteThrottled();
    }
  };

  private _get = async() => {
    const keys = Array.from(this.getPromises.keys());

    // const perf = performance.now();
    this.storage.get(keys as string[]).then((values) => {
      for(let i = 0, length = keys.length; i < length; ++i) {
        const key = keys[i];
        const deferred = this.getPromises.get(key);
        if(deferred) {
          // @ts-ignore
          deferred.resolve(this.cache[key] = values[i]);
          this.getPromises.delete(key);
        }
      }

      // console.log('[AS]: get time', keys, performance.now() - perf);
    }, (error: ApiError) => {
      const ignoreErrors: Set<ErrorType> = new Set(['NO_ENTRY_FOUND', 'STORAGE_OFFLINE']);
      if(!ignoreErrors.has(error.type)) {
        this.useStorage = false;
        this.log.error('get error', error, keys, this.storeName);
      }

      for(let i = 0, length = keys.length; i < length; ++i) {
        const key = keys[i];
        const deferred = this.getPromises.get(key);
        if(deferred) {
          // deferred.reject(error);
          deferred.resolve(undefined);
          this.getPromises.delete(key);
        }
      }
    }).finally(() => {
      if(this.getPromises.size) {
        this.getThrottled();
      }
    });
  };

  public isAvailable() {
    return this.useStorage;
  }

  public getCache() {
    return this.cache;
  }

  public getFromCache<T extends keyof Storage>(key: T) {
    return this.cache[key];
  }

  public setToCache(key: keyof Storage, value: Storage[typeof key]) {
    return this.cache[key] = value;
  }

  public async get<T extends keyof Storage>(key: T, useCache = true): Promise<Storage[T]> {
    if(this.cache.hasOwnProperty(key) && useCache) {
      return this.getFromCache(key);
    } else if(this.useStorage) {
      const r = this.getPromises.get(key);
      if(r) return r as any;

      const p = deferredPromise<Storage[T]>();
      this.getPromises.set(key, p as any);

      this.getThrottled();

      return p;
    }/*  else {
      throw 'something went wrong';
    } */
  }

  public getAll(): Promise<any[]> {
    return this.storage.getAll().catch(() => [] as any[]);
  }

  public getAllEntries() {
    return this.storage.getAllEntries().catch(() => [] as IDBStorage.Entries);
  }

  public set(obj: Partial<Storage>, onlyLocal = false) {
    // console.log('storageSetValue', obj, callback, arguments);

    const canUseStorage = this.useStorage && !onlyLocal && !this.savingFreezed;
    let setSomething = false;
    for(const key in obj) {
      if(obj.hasOwnProperty(key)) {
        const value = obj[key];
        this.setToCache(key, value);

        // let perf = /* DEBUG */false ? performance.now() : 0;
        // value = JSON.stringify(value);

        // if(perf) {
        //   let elapsedTime = performance.now() - perf;
        //   if(elapsedTime > 10) {
        //     console.warn('LocalStorage set: stringify time by JSON.stringify:', elapsedTime, key);
        //   }
        // }

        /* perf = performance.now();
        value = stringify(value);
        console.log('LocalStorage set: stringify time by own stringify:', performance.now() - perf); */

        if(canUseStorage) {
          this.keysToSet.add(key);
          this.keysToDelete.delete(key);
          this.saveThrottled();
        }

        setSomething = true;
      }
    }

    return canUseStorage && setSomething ? this.saveDeferred : Promise.resolve();
  }

  public delete(key: keyof Storage, saveLocal = false) {
    /* if(!this.cache.hasOwnProperty(key)) {
      return;
    } */

    // ! it is needed here
    key = '' + (key as string);

    if(!saveLocal) {
      delete this.cache[key];
    }

    if(this.useStorage) {
      this.keysToSet.delete(key);
      this.keysToDelete.add(key);
      this.deleteThrottled();
    }

    return this.useStorage ? this.deleteDeferred : Promise.resolve();
  }

  public clear(saveLocal = false) {
    if(!saveLocal) {
      for(const i in this.cache) {
        delete this.cache[i];
      }
    }

    return this.storage.clear().catch(noop);
  }

  public close() {
    return this.storage.close();
  }

  public static toggleStorage(enabled: boolean, clearWrite: boolean) {
    return Promise.all(this.STORAGES.map((storage) => {
      storage.useStorage = enabled;

      if(!IS_WORKER || !clearWrite) {
        return;
      }

      if(!enabled) {
        storage.keysToSet.clear();
        storage.keysToDelete.clear();
        storage.getPromises.forEach((deferred) => deferred.resolve(undefined));
        storage.getPromises.clear();
      } else {
        return storage.set(storage.cache);
      }
    })).catch(noop);
  }

  public static freezeSaving<T extends Database<any>>(callback: () => any, names: T['stores'][number]['name'][]) {
    this.STORAGES.forEach((storage) => storage.savingFreezed = true);
    try {
      callback();
    } catch(err) {
      console.error('freezeSaving callback error:', err);
    }
    this.STORAGES.forEach((storage) => storage.savingFreezed = false);
  }

  /* public deleteDatabase() {
    return IDBStorage.deleteDatabase().catch(noop);
  } */
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.AppStorage = AppStorage);
