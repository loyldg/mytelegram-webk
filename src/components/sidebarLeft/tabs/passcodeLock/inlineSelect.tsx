import {Component, createSelector, createSignal, For, JSX, onCleanup, onMount} from 'solid-js';
import {Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';

import ListenerSetter from '../../../../helpers/listenerSetter';

import ripple from '../../../ripple'; // keep
import {animateValue, simpleEasing} from '../../../mediaEditor/utils';

import styles from './inlineSelect.module.scss';

const InlineSelect: Component<{
  isOpen?: boolean;
  onClose?: () => void;
  value: string;
  onChange: (value: any) => void;
  options: { value: any; label: JSX.Element }[];
  parent: HTMLElement;
}> = (props) => {
  let valueEl: HTMLDivElement;

  const value = () => props.options.find((option) => option.value === props.value)?.label;
  const isSelected = createSelector(() => props.value);

  const [selectEl, setSelectEl] = createSignal<HTMLDivElement>();

  onMount(() => {
    const listenerSetter = new ListenerSetter();
    listenerSetter.add(window)('resize', () => {
      if(props.isOpen) props.onClose?.();
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });
  });

  const onEnter = async(el: Element, done: () => void) => {
    const selectEl = el.firstElementChild as HTMLElement;

    const valueRect = valueEl.getBoundingClientRect();
    const selectRect = selectEl.getBoundingClientRect();
    const selectedOptionRect = selectEl.querySelector(`.${styles.selected}`)?.getBoundingClientRect();

    const optionTop = selectedOptionRect.top - selectRect.top;
    const optionBottom = optionTop + selectedOptionRect.height;
    const distToOptionCenter = optionTop + selectedOptionRect.height / 2;
    const y = valueRect.top + valueRect.height / 2 - distToOptionCenter;
    const x = valueRect.left + valueRect.width / 2;

    const maxDist = Math.max(
      optionTop,
      selectRect.height - optionBottom
    );

    selectEl.style.setProperty('--x', '' + x);
    selectEl.style.setProperty('--y', '' + y);

    const getPath = (dist: number) =>
      `polygon(0% ${optionTop - dist}px, 100% ${optionTop - dist}px, 100% ${optionBottom + dist}px, 0px ${optionBottom + dist}px)`

    selectEl.animate({opacity: [0, 1]}, {duration: 100});

    animateValue(0, maxDist, 400, (dist) => {
      selectEl.style.setProperty('clip-path', getPath(dist));
    }, {
      easing: simpleEasing,
      onEnd: () => {
        selectEl.style.removeProperty('clip-path');
        done();
      }
    });

    done();
  };

  const onExit = (el: Element, done: () => void) => {
    const selectEl = el.firstElementChild as HTMLElement;

    selectEl.animate({opacity: [1, 0]}, {duration: 120})
    .finished.then(() => {
      done()
    });
  };

  const onMouseMove = (e: MouseEvent) => {
    const toCheck = [props.parent, selectEl()];
    if(!toCheck.every(Boolean)) return;

    const isOutside = toCheck.every((el) => {
      const rect = el.getBoundingClientRect();
      return Math.max(rect.left - e.clientX, e.clientX - rect.right, rect.top - e.clientY, e.clientY - rect.bottom) > 50;
    });

    if(isOutside) {
      props.onClose?.();
    }
  };

  return (
    <>
      <div ref={valueEl} class={styles.Value}>
        {value()}
      </div>

      <Portal>
        <Transition
          appear
          onEnter={onEnter}
          onExit={onExit}
        >
          {props.isOpen && (
            <div
              class={styles.Overlay}
              onClick={(e) => {
                e.stopPropagation();
                props.onClose?.();
              }}
              onMouseMove={onMouseMove}
            >
              <div class={styles.SelectClip}>
                <div class={styles.Select} ref={setSelectEl}>
                  <For each={props.options}>
                    {option =>
                      <div
                        use:ripple
                        class={styles.Option}
                        classList={{
                          [styles.selected]: isSelected(option.value)
                        }}
                        onClick={() => {
                          props.onChange(option.value);
                        }}
                      >
                        <span>
                          {option.label}
                        </span>
                      </div>
                    }
                  </For>
                </div>
              </div>
            </div>
          )}
        </Transition>
      </Portal>

    </>
  );
};

export default InlineSelect;
