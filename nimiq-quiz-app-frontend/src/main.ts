import { createApp } from 'vue'
import './style.css'
// Tokens first, then the primitives built on them. Custom properties resolve
// at computed-value time so the order isn't load-bearing for var(), but it
// keeps the cascade readable.
import './primitives.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
