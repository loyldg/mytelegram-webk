/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createResource, JSX, on, onMount, Suspense} from 'solid-js';
import PeerTitle, {PeerTitleOptions} from '../peerTitle';

export default async function wrapPeerTitle(options: PeerTitleOptions) {
  const peerTitle = new PeerTitle();
  await peerTitle.update(options);
  return peerTitle.element;
}

export function PeerTitleTsx(props: PeerTitleOptions & { fallback?: JSX.Element }) {
  const peerTitle = new PeerTitle();
  createEffect(() => peerTitle.update(props));
  return peerTitle.element;
}
