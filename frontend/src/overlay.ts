import './styles.css';
import { PetRuntime } from './pet/runtime';
import { AndroidHost } from './hosts/android';
const runtime = new PetRuntime(document.getElementById('app')!, new AndroidHost());
void runtime.start().catch(error => console.error('Overlay initialization failed', error));
window.addEventListener('pagehide', () => runtime.dispose(), { once: true });
