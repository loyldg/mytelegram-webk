import {createContext, useContext} from 'solid-js';

// `import type` is mandatory to avoid reloading the page
import type {RootScope} from '../rootScope';
import type {AppSidebarLeft} from '../../components/sidebarLeft';
import type AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import type AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import type EmoticonsSearch from '../../components/emoticonsDropdown/search';
import type wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import type showLimitPopup from '../../components/popups/limit';

export type SolidJSHotReloadGuardContextValue = {
  rootScope: RootScope;
  appSidebarLeft: AppSidebarLeft;
  AppChatFoldersTab: typeof AppChatFoldersTab;
  AppEditFolderTab: typeof AppEditFolderTab;
  EmoticonsSearch: typeof EmoticonsSearch;
  wrapStickerSetThumb: typeof wrapStickerSetThumb;
  showLimitPopup: typeof showLimitPopup;
};

export const SolidJSHotReloadGuardContext = createContext<SolidJSHotReloadGuardContextValue>(null);

/**
 * If importing a module causes the page to reload when you make changes in your SolidJS component
 * provide the values through the SolidJSHotReloadGuardProvider
 */
export function useHotReloadGuard() {
  const contextValue = useContext(SolidJSHotReloadGuardContext);
  if(!contextValue) throw new Error('useHotReloadGuard should not be used outside a <SolidJSHotReloadGuardProvider />');

  return contextValue;
}
