import {ParentProps} from 'solid-js';

import appSidebarLeft from '../../components/sidebarLeft';
import AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import EmoticonsSearch from '../../components/emoticonsDropdown/search';
import wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import showLimitPopup from '../../components/popups/limit';
import {setQuizHint} from '../../components/poll';
import themeController from '../../helpers/themeController';

import apiManagerProxy from '../mtproto/mtprotoworker';
import appImManager from '../appManagers/appImManager';
import lottieLoader from '../rlottie/lottieLoader';
import rootScope from '../rootScope';


import {SolidJSHotReloadGuardContext} from './hotReloadGuard';

export default function SolidJSHotReloadGuardProvider(props: ParentProps) {
  return (
    <SolidJSHotReloadGuardContext.Provider value={{
      rootScope,
      appSidebarLeft,
      AppEditFolderTab,
      AppChatFoldersTab,
      EmoticonsSearch,
      wrapStickerSetThumb,
      showLimitPopup,
      lottieLoader,
      themeController,
      appImManager,
      apiManagerProxy,
      setQuizHint
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
