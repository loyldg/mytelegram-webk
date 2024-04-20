/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_PARALLAX_SUPPORTED from '../environment/parallaxSupport';
import deferredPromise from '../helpers/cancellablePromise';
import {copyTextToClipboard} from '../helpers/clipboard';
import anchorCopy from '../helpers/dom/anchorCopy';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import replaceContent from '../helpers/dom/replaceContent';
import safeWindowOpen from '../helpers/dom/safeWindowOpen';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import ListenerSetter from '../helpers/listenerSetter';
import makeError from '../helpers/makeError';
import {makeMediaSize} from '../helpers/mediaSize';
import {getMiddleware, Middleware, MiddlewareHelper} from '../helpers/middleware';
import middlewarePromise from '../helpers/middlewarePromise';
import {BusinessWeeklyOpen, BusinessWorkHours, Chat, ChatFull, HelpTimezonesList, Timezone, User, UserFull, UserStatus} from '../layer';
import appImManager from '../lib/appManagers/appImManager';
import {AppManagers} from '../lib/appManagers/managers';
import getServerMessageId from '../lib/appManagers/utils/messageId/getServerMessageId';
import getPeerActiveUsernames from '../lib/appManagers/utils/peers/getPeerActiveUsernames';
import I18n, {i18n, join} from '../lib/langPack';
import {MTAppConfig} from '../lib/mtproto/appConfig';
import {HIDDEN_PEER_ID} from '../lib/mtproto/mtproto_config';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import rootScope from '../lib/rootScope';
import {avatarNew} from './avatarNew';
import BusinessHours from './businessHours';
import CheckboxField from './checkboxField';
import {generateDelimiter} from './generateDelimiter';
import PeerProfileAvatars, {SHOW_NO_AVATAR} from './peerProfileAvatars';
import PopupElement from './popups';
import PopupToggleReadDate from './popups/toggleReadDate';
import Row from './row';
import Scrollable from './scrollable';
import SettingSection from './settingSection';
import {toast} from './toast';
import formatUserPhone from './wrappers/formatUserPhone';
import wrapPeerTitle from './wrappers/peerTitle';
import wrapTopicNameButton from './wrappers/topicNameButton';
import {batch, createRoot, createSignal} from 'solid-js';

const setText = (text: Parameters<typeof setInnerHTML>[1], row: Row) => {
  setInnerHTML(row.title, text || undefined);
  row.container.style.display = text ? '' : 'none';
};

export default class PeerProfile {
  public element: HTMLElement;
  private avatars: PeerProfileAvatars;
  private avatar: ReturnType<typeof avatarNew>;
  private section: SettingSection;
  private name: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private bio: Row;
  private username: Row;
  private phone: Row;
  private notifications: Row;
  private location: Row;
  private link: Row;
  private businessHours: Row;

  private setBusinessHours: (hours: BusinessWorkHours) => void;
  private setTimezones: (timezones: Timezone[]) => void;

  private cleaned: boolean;
  private setMoreDetailsTimeout: number;
  private setPeerStatusInterval: number;

  private peerId: PeerId;
  private threadId: number;

  private middlewareHelper: MiddlewareHelper;

  constructor(
    private managers: AppManagers,
    private scrollable: Scrollable,
    private listenerSetter?: ListenerSetter,
    private isDialog = true,
    private setCollapsedOn?: HTMLElement
  ) {
    if(!IS_PARALLAX_SUPPORTED) {
      this.scrollable.container.classList.add('no-parallax');
    }

    if(!listenerSetter) {
      this.listenerSetter = new ListenerSetter();
    }

    this.middlewareHelper = getMiddleware();
  }

  public init() {
    this.init = null;

    this.element = document.createElement('div');
    this.element.classList.add('profile-content');

    this.section = new SettingSection({
      noDelimiter: true
    });

    this.name = document.createElement('div');
    this.name.classList.add('profile-name');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('profile-subtitle');

    this.setCollapsedOn.classList.add('profile-container');

    this.bio = new Row({
      title: ' ',
      subtitle: true,
      icon: 'info',
      clickable: (e) => {
        if((e.target as HTMLElement).tagName === 'A') {
          return;
        }

        copyTextToClipboard(this.bio.title.textContent);
        toast(I18n.format('BioCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_About',
          onClick: () => {
            simulateClickEvent(this.bio.container);
          },
          verify: () => !this.peerId.isUser()
        }, {
          icon: 'copy',
          text: 'Text.CopyLabel_Bio',
          onClick: () => {
            simulateClickEvent(this.bio.container);
          },
          verify: () => this.peerId.isUser()
        }]
      }
    });

    this.bio.title.classList.add('pre-wrap');

    this.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: () => {
        // const username = await this.managers.appPeersManager.getPeerUsername(this.peerId);
        copyTextToClipboard('@' + this.username.title.textContent);
        toast(I18n.format('UsernameCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_Username',
          onClick: () => {
            simulateClickEvent(this.username.container);
          }
        }]
      }
    });

    this.phone = new Row({
      title: ' ',
      subtitle: true,
      icon: 'phone',
      clickable: () => {
        copyTextToClipboard(this.phone.title.textContent.replace(/\s/g, ''));
        toast(I18n.format('PhoneCopied', true));
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_PhoneNumber',
          onClick: () => {
            simulateClickEvent(this.phone.container);
          }
        }, {
          icon: 'info',
          text: 'PeerInfo.Phone.AnonymousInfo',
          textArgs: [(() => {
            const a = document.createElement('a');
            return a;
          })()],
          onClick: () => {
            safeWindowOpen('https://fragment.com/numbers');
          },
          separator: true,
          secondary: true,
          verify: async() => {
            const {isAnonymous} = await this.managers.appUsersManager.getUserPhone(this.peerId.toUserId()) || {};
            return isAnonymous;
          }
        }]
      }
    });

    this.link = new Row({
      title: ' ',
      subtitleLangKey: 'SetUrlPlaceholder',
      icon: 'link',
      clickable: () => {
        const url = this.link.title.textContent;
        copyTextToClipboard(url);
        // Promise.resolve(appProfileManager.getChatFull(this.peerId.toChatId())).then((chatFull) => {
        // copyTextToClipboard(chatFull.exported_invite.link);
        const isPrivate = url.includes('/c/');
        toast(I18n.format(isPrivate ? 'LinkCopiedPrivateInfo' : 'LinkCopied', true));
        // });
      },
      listenerSetter: this.listenerSetter,
      contextMenu: {
        buttons: [{
          icon: 'copy',
          text: 'Text.CopyLabel_ShareLink',
          onClick: () => {
            simulateClickEvent(this.link.container);
          }
        }]
      }
    });

    this.location = new Row({
      title: ' ',
      subtitleLangKey: 'ChatLocation',
      icon: 'location'
    });

    this.businessHours = createRoot((dispose) => {
      this.middlewareHelper.onDestroy(dispose);
      const [hours, setHours] = createSignal<BusinessWorkHours>();
      const [timezones, setTimezones] = createSignal<Timezone[]>();
      this.setBusinessHours = setHours;
      this.setTimezones = setTimezones;
      return BusinessHours({hours, timezones});
    });

    this.section.content.append(
      this.phone.container,
      this.username.container,
      this.location.container,
      this.bio.container,
      this.link.container,
      this.businessHours.container
    );

    const {listenerSetter} = this;
    if(this.isDialog) {
      this.notifications = new Row({
        checkboxField: new CheckboxField({toggle: true}),
        titleLangKey: 'Notifications',
        icon: 'unmute',
        listenerSetter: this.listenerSetter
      });

      listenerSetter.add(this.notifications.checkboxField.input)('change', (e) => {
        if(!e.isTrusted) {
          return;
        }

        // let checked = this.notificationsCheckbox.checked;
        this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, threadId: this.threadId});
      });

      listenerSetter.add(rootScope)('dialog_notify_settings', async(dialog) => {
        if(this.peerId === dialog.peerId) {
          const muted = await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.threadId});
          this.notifications.checkboxField.checked = !muted;
        }
      });

      this.section.content.append(this.notifications.container);
    }

    this.element.append(this.section.container);

    if(IS_PARALLAX_SUPPORTED) {
      this.element.append(generateDelimiter());
    }

    listenerSetter.add(rootScope)('peer_typings', ({peerId}) => {
      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    listenerSetter.add(rootScope)('peer_bio_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.setMoreDetails(true);
      }
    });

    const n = async({peerId, threadId}: {peerId: PeerId, threadId?: number}) => {
      if(this.peerId !== peerId) {
        return false;
      }

      const isForum = this.peerId.isAnyChat() ? await this.managers.appPeersManager.isForum(this.peerId) : false;
      if(isForum && this.threadId ? this.threadId === threadId : true) {
        return true;
      }

      return false;
    };

    listenerSetter.add(rootScope)('peer_title_edit', async(data) => {
      const middleware = this.middlewareHelper.get();
      if(await n(data)) {
        if(!middleware()) return;
        this.fillUsername().then((callback) => {
          if(!middleware()) return;
          callback?.();
        });
        this.setMoreDetails(true);
      }
    });

    listenerSetter.add(rootScope)('user_update', (userId) => {
      if(this.peerId === userId.toPeerId()) {
        this.setPeerStatus();
      }
    });

    listenerSetter.add(rootScope)('contacts_update', async(userId) => {
      if(this.peerId === userId.toPeerId()) {
        const user = await this.managers.appUsersManager.getUser(userId);
        if(!user.pFlags.self || !this.isDialog) {
          this.fillUserPhone();
        }
      }
    });

    listenerSetter.add(rootScope)('avatar_update', async(data) => {
      if(await n(data)) {
        this.setAvatar();
      }
    });

    const refreshCurrentUser = () => {
      if(this.peerId.isUser()) {
        this.managers.appUsersManager.getApiUsers([this.peerId.toUserId()]);
      }
    };

    // * refresh user online status
    listenerSetter.add(rootScope)('premium_toggle', refreshCurrentUser);
    listenerSetter.add(rootScope)('privacy_update', (updatePrivacy) => {
      if(updatePrivacy.key._ === 'privacyKeyStatusTimestamp') {
        refreshCurrentUser();
      }
    });

    this.setPeerStatusInterval = window.setInterval(() => this.setPeerStatus(), 60e3);
  }

  private async setPeerStatus<T extends boolean>(
    needClear = false,
    manual?: T
  ): Promise<T extends true ? () => void : void> {
    const peerId = this.peerId;

    const callbacks: Array<() => void> = [];
    callbacks.push(() => {
      this.element.classList.toggle('is-me', peerId === rootScope.myId);
      if(peerId.isUser()) {
        const user = apiManagerProxy.getUser(peerId.toUserId());
        if((user.status as UserStatus.userStatusRecently)?.pFlags?.by_me) {
          // Don't append the when element if it's already been added
          if(this.subtitle.querySelector('.show-when')) {
            return;
          }

          const when = i18n('StatusHiddenShow');
          when.classList.add('show-when');
          attachClickEvent(when, (e) => {
            cancelEvent(e);
            PopupElement.createPopup(PopupToggleReadDate, peerId, 'lastSeen');
          });
          this.subtitle.append(when);
        }
      }
    });

    let promise: Promise<(() => void) | void> = Promise.resolve();
    if(!(!peerId || (rootScope.myId === peerId && this.isDialog)) && peerId !== HIDDEN_PEER_ID) {
      const isForum = await this.managers.appPeersManager.isForum(this.peerId);
      const middleware = this.middlewareHelper.get();
      if(isForum && this.threadId) {
        promise = wrapTopicNameButton({
          peerId,
          wrapOptions: {
            middleware
          }
        }).then(({element}) => {
          this.subtitle.replaceChildren(element);
        });
      } else {
        promise = appImManager.setPeerStatus({
          peerId,
          element: this.subtitle,
          needClear,
          useWhitespace: true,
          middleware,
          ignoreSelf: !this.isDialog
        });
      }

      promise.then((callback) => callback && callbacks.unshift(callback));
    }

    const callback = () => callbacks.forEach((callback) => callback());

    return promise.then(() => {
      if(manual) {
        return callback;
      }

      callback();
    }) as any;
  }

  public cleanupHTML() {
    [
      this.bio,
      this.phone,
      this.username,
      this.location,
      this.link,
      this.businessHours
    ].forEach((row) => {
      row.container.style.display = 'none';
    });

    if(this.notifications) {
      this.notifications.container.style.display = '';
      this.notifications.checkboxField.checked = true;
    }

    this.clearSetMoreDetailsTimeout();
  }

  private isSavedDialog() {
    return !!(this.peerId === rootScope.myId && this.threadId);
  }

  private getDetailsForUse() {
    const {peerId, threadId} = this;
    return this.isSavedDialog() ? {
      peerId: threadId,
      threadId: undefined
    } : {
      peerId,
      threadId
    };
  }

  private canBeDetailed() {
    return this.peerId !== rootScope.myId || !this.isDialog;
  }

  private async _setAvatar() {
    const middleware = this.middlewareHelper.get();
    const {peerId, threadId} = this.getDetailsForUse();
    const isTopic = !!(threadId && await this.managers.appPeersManager.isForum(peerId));
    if(/* this.canBeDetailed() &&  */!isTopic) {
      const photo = await this.managers.appPeersManager.getPeerPhoto(peerId);

      if(photo || SHOW_NO_AVATAR) {
        const oldAvatars = this.avatars;
        this.avatars = new PeerProfileAvatars(this.scrollable, this.managers, this.setCollapsedOn);
        await this.avatars.setPeer(peerId);
        const nameCallback = await this.fillName(middleware, this.setCollapsedOn.classList.contains('need-white'));

        return () => {
          nameCallback();

          this.avatars.info.append(this.name, this.subtitle);

          if(this.avatar) this.avatar.node.remove();
          this.avatar = undefined;

          if(oldAvatars) oldAvatars.container.replaceWith(this.avatars.container);
          else this.element.prepend(this.avatars.container);

          if(IS_PARALLAX_SUPPORTED) {
            this.scrollable.container.classList.add('parallax');
          }
        };
      }
    }

    const avatar = avatarNew({
      middleware,
      size: 120,
      isDialog: this.isDialog,
      peerId,
      threadId: isTopic ? threadId : undefined,
      wrapOptions: {
        customEmojiSize: makeMediaSize(120, 120),
        middleware
      },
      withStories: true,
      meAsNotes: !!(peerId === rootScope.myId && this.threadId)
    });
    avatar.node.classList.add('profile-avatar', 'avatar-120');
    const [nameCallback] = await Promise.all([
      this.fillName(middleware, false),
      avatar.readyThumbPromise
    ]);

    return () => {
      nameCallback();

      if(IS_PARALLAX_SUPPORTED) {
        this.scrollable.container.classList.remove('parallax');
      }

      if(this.avatars) {
        this.avatars.container.remove();
        this.avatars.cleanup();
        this.avatars = undefined;
      }

      if(this.avatar) this.avatar.node.remove();
      this.avatar = avatar;

      this.section.content.prepend(this.avatar.node, this.name, this.subtitle);
    };
  }

  private setAvatar<T extends boolean>(manual?: T): T extends true ? Promise<() => void> : Promise<void> {
    const promise = this._setAvatar();
    return manual ? promise : promise.then((callback) => callback()) as any;
  }

  private getUsernamesAlso(usernames: string[]) {
    const also = usernames.slice(1);
    if(also.length) {
      const a = also.map((username) => anchorCopy({username}));
      const i = i18n('UsernameAlso', [join(a, false)]);
      return i;
    }
  }

  private async fillUsername() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const usernames = await this.managers.appPeersManager.getPeerActiveUsernames(peerId);
      const also = this.getUsernamesAlso(usernames);

      return () => {
        this.username.subtitle.replaceChildren(also || i18n('Username'));
        setText(usernames[0], this.username);
      };
    }
  }

  private async fillUserPhone() {
    const {peerId} = this;
    if(peerId.isUser() && this.canBeDetailed()) {
      const {phone, isAnonymous} = await this.managers.appUsersManager.getUserPhone(peerId.toUserId()) || {};

      return () => {
        this.phone.subtitle.replaceChildren(i18n(isAnonymous ? 'AnonymousNumber' : 'Phone'));
        setText(phone ? formatUserPhone(phone) : undefined, this.phone);
      };
    }
  }

  private async fillNotifications() {
    const notificationsRow = this.notifications;
    if(!notificationsRow) {
      return;
    }

    if(this.canBeDetailed()) {
      const muted = await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.threadId});
      return () => {
        notificationsRow.checkboxField.checked = !muted;
      };
    } else {
      return () => {
        // fastRaf(() => {
        notificationsRow.container.style.display = 'none';
        // });
      };
    }
  }

  private async fillName(middleware: Middleware, white?: boolean) {
    const {peerId} = this.getDetailsForUse();
    const [element/* , icons */] = await Promise.all([
      wrapPeerTitle({
        peerId,
        dialog: this.isDialog,
        withIcons: !this.threadId,
        threadId: this.threadId,
        wrapOptions: {
          middleware,
          textColor: white ? 'white' : undefined
        },
        meAsNotes: !!(peerId === rootScope.myId && this.threadId)
      })

      // generateTitleIcons(peerId)
    ]);

    return () => {
      replaceContent(this.name, element);
      // this.name.append(...icons);
    };
  }

  private async fillRows(manual: Promise<any>) {
    return Promise.all([
      this.fillUsername(),
      this.fillUserPhone(),
      this.fillNotifications(),
      this.setMoreDetails(undefined, manual),
      this.setPeerStatus(true, true)
    ]).then((callbacks) => {
      return () => {
        callbacks.forEach((callback) => callback?.());
      };
    });
  }

  public async fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;

    this.cleanupHTML();
    const deferred = deferredPromise<void>();
    const middleware = this.middlewareHelper.get();
    middleware.onClean(() => {
      deferred.reject();
    });

    const callbacks = await Promise.all([
      this.setAvatar(true),
      this.fillRows(deferred)
    ]);

    return () => {
      deferred.resolve();
      callbacks.forEach((callback) => callback?.());
    };
  }

  private async _setMoreDetails(peerId: PeerId, peerFull: ChatFull | UserFull, appConfig: MTAppConfig, timezones: Timezone[]) {
    const m = this.getMiddlewarePromise();
    const isTopic = !!(this.threadId && await m(this.managers.appPeersManager.isForum(peerId)));
    const isPremium = peerId.isUser() ? await m(this.managers.appUsersManager.isPremium(peerId.toUserId())) : undefined;
    if(isTopic) {
      let url = 'https://t.me/';
      const threadId = getServerMessageId(this.threadId);
      const username = await m(this.managers.appPeersManager.getPeerUsername(peerId));
      if(username) {
        url += `${username}/${threadId}`;
      } else {
        url += `c/${peerId.toChatId()}/${threadId}`;
      }

      return () => {
        setText(url, this.link);
      };
    }

    const callbacks: (() => void)[] = [];
    // if(peerFull.about) {
    callbacks.push(() => {
      this.bio.subtitle.replaceChildren(i18n(peerId.isUser() ? 'UserBio' : 'Info'));
      setText(peerFull.about ? wrapRichText(peerFull.about, {
        whitelistedDomains: isPremium ? undefined : appConfig.whitelisted_domains
      }) : undefined, this.bio);
    });
    // }

    if(!peerId.isUser()) {
      const chat = await m(this.managers.appChatsManager.getChat(peerId.toChatId())) as Chat.channel;
      const usernames = getPeerActiveUsernames(chat);
      let also: HTMLElement;
      if(usernames.length) {
        also = this.getUsernamesAlso(usernames);
        callbacks.push(() => setText('https://t.me/' + usernames[0], this.link));
      } else {
        const exportedInvite = (peerFull as ChatFull.channelFull).exported_invite;
        if(exportedInvite?._ === 'chatInviteExported') {
          callbacks.push(() => setText(exportedInvite.link, this.link));
        }
      }

      callbacks.push(() => this.link.subtitle.replaceChildren(also || i18n('SetUrlPlaceholder')));
    }

    const location = (peerFull as ChatFull.channelFull).location;
    if(location?._ == 'channelLocation') {
      callbacks.push(() => setText(location.address, this.location));
    }

    const workHours = (peerFull as UserFull).business_work_hours;
    if(workHours) {
      batch(() => {
        this.setBusinessHours(workHours);
        this.setTimezones(timezones);
      });
    }

    callbacks.push(() => {
      this.businessHours.container.style.display = workHours ? '' : 'none';
    });

    this.setMoreDetailsTimeout = window.setTimeout(() => this.setMoreDetails(true), 60e3);

    return () => {
      callbacks.forEach((callback) => callback());
    };
  }

  private async setMoreDetails(override?: true, manual?: Promise<any>) {
    this.clearSetMoreDetailsTimeout();

    const {peerId} = this;
    const m = this.getMiddlewarePromise();

    if(!peerId || !this.canBeDetailed() || await m(this.managers.appPeersManager.isPeerRestricted(peerId))) {
      return;
    }

    const results = await m(Promise.all([
      this.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId, override),
      this.managers.acknowledged.apiManager.getAppConfig(),
      this.managers.acknowledged.apiManager.getTimezonesList()
    ]));
    const promises = results.map((result) => result.result) as [Promise<ChatFull | UserFull.userFull>, Promise<MTAppConfig>, Promise<HelpTimezonesList.helpTimezonesList>];
    const setPromise = m(Promise.all(promises)).then(async([peerFull, appConfig, timezonesList]) => {
      if(await m(this.managers.appPeersManager.isPeerRestricted(peerId))) {
        // this.log.warn('peer changed');
        return;
      }

      return m(this._setMoreDetails(peerId, peerFull, appConfig, timezonesList.timezones));
    });

    if(results.every((result) => result.cached) && manual) {
      return setPromise;
    } else {
      (manual || Promise.resolve())
      .then(() => setPromise)
      .then((callback) => {
        callback?.();
      });
    }
  }

  private getMiddlewarePromise() {
    return middlewarePromise(this.middlewareHelper.get(), makeError('MIDDLEWARE'));
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return;

    this.init?.();

    this.peerId = peerId;
    this.threadId = threadId;

    this.middlewareHelper.clean();
    this.cleaned = true;
  }

  public clearSetMoreDetailsTimeout() {
    if(this.setMoreDetailsTimeout !== undefined) {
      clearTimeout(this.setMoreDetailsTimeout);
      this.setMoreDetailsTimeout = undefined;
    }
  }

  public destroy() {
    this.peerId = this.threadId = undefined;
    this.clearSetMoreDetailsTimeout();
    clearInterval(this.setPeerStatusInterval);
    this.avatars?.cleanup();
    this.middlewareHelper.destroy();
  }
}
