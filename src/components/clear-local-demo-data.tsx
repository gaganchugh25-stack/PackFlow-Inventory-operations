'use client';

import { useEffect } from 'react';

export function ClearLocalDemoData() {
  useEffect(() => { window.localStorage.removeItem('packflow-local-demo-v1'); }, []);
  return null;
}
