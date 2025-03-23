import {Component} from 'solid-js';
import {render} from 'solid-js/web';

import SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {PasscodeActions} from '../../../../lib/passcode/actions';
import {LangPackKey} from '../../../../lib/langPack';
import {InstanceOf} from '../../../../types';

import {SliderSuperTab} from '../../../slider';

import type AppPrivacyAndSecurityTab from '../privacyAndSecurity';

import {PromiseCollector} from './promiseCollector';
import {SuperTabProvider} from './superTabProvider';

type ScaffoldSolidJSTabArgs<Payload> = {
  title: LangPackKey;
  getComponentModule: () => MaybePromise<{default: Component}>;
  onOpenAfterTimeout?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
};

type ScaffoledClass<Payload = void> = new (...args: ConstructorParameters<typeof SliderSuperTab>) => SliderSuperTab & {
  payload: Payload;
  init(payload: Payload, overrideTitle?: LangPackKey): Promise<void>;
};

function scaffoldSolidJSTab<Payload = void>({
  title,
  getComponentModule,
  onOpenAfterTimeout
}: ScaffoldSolidJSTabArgs<Payload>): ScaffoledClass<Payload> {
  return class extends SliderSuperTab {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload, overrideTitle?: LangPackKey) {
      this.setTitle(overrideTitle || title);
      this.payload = payload;

      const div = document.createElement('div');

      const {default: Component} = await getComponentModule();

      const loadPromises: Promise<any>[] = [];
      let collectPromise = (promise: Promise<any>) => {
        loadPromises.push(promise);
      };

      this.dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={(promise) => collectPromise(promise)}>
            {/* Provide other tabs here to avoid circular imports */}
            <SuperTabProvider self={this} allTabs={allTabs}>
              <Component />
            </SuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      collectPromise = () => {}; // lose reference to the promises array
      // console.log('loadPromises.length :>> ', loadPromises.length);

      this.scrollable.append(div);

      await Promise.all(loadPromises);
    }

    protected onCloseAfterTimeout() {
      this.dispose?.();
      super.onCloseAfterTimeout();
    }

    protected onOpenAfterTimeout() {
      onOpenAfterTimeout?.call?.(this);
    }
  } as ScaffoledClass<Payload>;
}

type AppPasscodeLockTabPayload = {
  AppPrivacyAndSecurityTab: typeof AppPrivacyAndSecurityTab;
};

export const AppPasscodeLockTab =
  scaffoldSolidJSTab<AppPasscodeLockTabPayload>({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('./mainTab'),
    onOpenAfterTimeout: async function() {
      // Remove the previous enter password tab
      this.slider.sliceTabsUntilTab(
        this.payload.AppPrivacyAndSecurityTab,
        this
      );
    }
  });

type AppPasscodeEnterPasswordTabPayload = {
  onSubmit: (passcode: string, tab: InstanceOf<typeof AppPasscodeEnterPasswordTab>, passcodeActions: PasscodeActions) => MaybePromise<void>;

  inputLabel: LangPackKey;
  buttonText: LangPackKey;
};

export const AppPasscodeEnterPasswordTab =
  scaffoldSolidJSTab<AppPasscodeEnterPasswordTabPayload>({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('./enterPasswordTab')
  });


export type AllPasscodeLockTabs = typeof allTabs;

const allTabs = {
  AppPasscodeLockTab,
  AppPasscodeEnterPasswordTab
};
