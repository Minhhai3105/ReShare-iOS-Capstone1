<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import { normalizeText } from './text.js'

const props = defineProps({
  id: { type: String, required: true },
  labelledBy: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Chọn giá trị' },
  emptyText: { type: String, default: 'Không có lựa chọn' },
})
const emit = defineEmits(['update:modelValue'])
const root = ref(null), trigger = ref(null), panel = ref(null)
const open = ref(false), activeIndex = ref(-1), panelStyle = ref({})
const selected = computed(() => props.options.find(option => option.value === props.modelValue))
const enabled = computed(() => props.options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0))
const listId = computed(() => `${props.id}-listbox`)
const valueId = computed(() => `${props.id}-value`)
const optionId = index => `${props.id}-option-${index}`
let search = '', searchTimer

function close() {
  open.value = false
  search = ''
  clearTimeout(searchTimer)
}

function positionPanel() {
  if (!open.value || !trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) return close()
  const below = window.innerHeight - rect.bottom - 20, above = rect.top - 20
  const expectedHeight = Math.min(320, props.options.length * 44 + 14)
  const upward = below < expectedHeight && above > below
  const width = Math.min(rect.width, window.innerWidth - 24)
  panelStyle.value = {
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    top: `${upward ? rect.top - 8 : rect.bottom + 8}px`,
    width: `${width}px`, maxHeight: `${Math.max(44, Math.min(320, upward ? above : below))}px`,
    transform: upward ? 'translateY(-100%)' : undefined,
    // This fixed panel stays inside AuthShell in the DOM to inherit its theme tokens.
  }
}

async function revealActive() {
  await nextTick()
  const option = panel.value?.querySelector(`#${CSS.escape(optionId(activeIndex.value))}`)
  if (!option || !panel.value) return
  const top = option.offsetTop, bottom = top + option.offsetHeight
  if (top < panel.value.scrollTop) panel.value.scrollTop = top
  else if (bottom > panel.value.scrollTop + panel.value.clientHeight) panel.value.scrollTop = bottom - panel.value.clientHeight
}

function show(edge) {
  if (props.disabled) return
  open.value = true
  const index = props.options.findIndex(option => option.value === props.modelValue && !option.disabled)
  activeIndex.value = index >= 0 ? index : edge === 'last' ? enabled.value.at(-1) ?? -1 : enabled.value[0] ?? -1
  positionPanel()
  revealActive()
}

function choose(index) {
  const option = props.options[index]
  if (props.disabled || !option || option.disabled) return
  emit('update:modelValue', option.value)
  close()
}

function move(direction) {
  const indices = enabled.value
  if (!indices.length) return
  const current = indices.indexOf(activeIndex.value)
  activeIndex.value = indices[Math.max(0, Math.min(indices.length - 1, current + direction))]
  revealActive()
}

function onKeydown(event) {
  if (props.disabled || event.isComposing) return
  const key = event.key
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
    event.preventDefault()
    const wasOpen = open.value
    if (!wasOpen) show(key === 'ArrowUp' || key === 'End' ? 'last' : 'first')
    if (key === 'Home' || key === 'End') {
      activeIndex.value = key === 'Home' ? enabled.value[0] ?? -1 : enabled.value.at(-1) ?? -1
      revealActive()
    } else if (wasOpen) move(key === 'ArrowDown' ? 1 : -1)
  } else if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    if (open.value && activeIndex.value >= 0) choose(activeIndex.value)
    else if (open.value) close()
    else show()
  } else if (key === 'Escape') {
    if (open.value) event.preventDefault()
    close()
  } else if (key === 'Tab') {
    if (open.value && activeIndex.value >= 0) choose(activeIndex.value)
    else close()
  } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    if (!open.value) show()
    clearTimeout(searchTimer)
    search += normalizeText(key)
    const term = [...search].every(char => char === search[0]) ? search[0] : search
    const indices = enabled.value, start = indices.indexOf(activeIndex.value)
    const ordered = term.length === 1 ? [...indices.slice(start + 1), ...indices.slice(0, start + 1)] : [...indices.slice(start), ...indices.slice(0, start)]
    const match = ordered.find(index => normalizeText(props.options[index].label).startsWith(term))
    if (match !== undefined) { activeIndex.value = match; revealActive() }
    searchTimer = setTimeout(() => { search = '' }, 700)
  }
}

function outside(event) { if (!root.value?.contains(event.target)) close() }
function onScroll(event) { if (event.target !== panel.value) positionPanel() }
watch(() => props.disabled, disabled => { if (disabled) close() })
watch(() => [props.modelValue, props.options], () => { if (open.value) show() })
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', onScroll, true)
})
onBeforeUnmount(() => {
  close()
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', outside)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div ref="root" class="admin-select" :class="{ 'is-open': open }">
    <button :id="id" ref="trigger" type="button" class="admin-select__trigger" role="combobox"
      :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open"
      :aria-controls="open ? listId : undefined" :aria-labelledby="`${labelledBy} ${valueId}`"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      @click="open ? close() : show()" @keydown="onKeydown">
      <span :id="valueId" class="admin-select__value">{{ selected?.label || placeholder }}</span>
      <AuthIcon name="chevron-right" :size="18" class="admin-select__chevron" />
    </button>
    <ul v-if="open" :id="listId" ref="panel" role="listbox" :aria-labelledby="labelledBy" class="admin-select__menu" :style="panelStyle">
      <li v-for="(option, index) in options" :id="optionId(index)" :key="option.value" role="option"
        :aria-selected="option.value === modelValue" :aria-disabled="option.disabled || undefined"
        class="admin-select__option" :class="{ 'is-active': activeIndex === index, 'is-selected': option.value === modelValue, 'is-disabled': option.disabled }"
        @mousedown.prevent @pointermove="!option.disabled && (activeIndex = index)" @click.stop="choose(index)">
        <span>{{ option.label }}</span><AuthIcon v-if="option.value === modelValue" name="check" :size="18" />
      </li>
      <li v-if="!options.length" role="presentation" class="admin-select__empty">{{ emptyText }}</li>
    </ul>
  </div>
</template>

<style scoped>
.admin-select { min-width: 0; }
.admin-select__trigger { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px; border: 1.5px solid var(--auth-border); border-radius: 10px; background: var(--auth-surface); color: var(--auth-text); font: inherit; font-size: 15px; line-height: 1.5; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.admin-select__trigger:hover:not(:disabled) { border-color: var(--auth-primary); }
.admin-select__trigger:focus-visible, .is-open .admin-select__trigger { border-color: var(--auth-primary); outline: none; box-shadow: 0 0 0 3px var(--auth-primary-soft); }
.admin-select__trigger:disabled { background: var(--auth-bg); color: var(--auth-text-tertiary); cursor: not-allowed; }
.admin-select__value { min-width: 0; overflow-wrap: anywhere; }
.admin-select__chevron { flex-shrink: 0; color: var(--auth-text-secondary); transform: rotate(90deg); transition: transform .15s; }
.is-open .admin-select__chevron { transform: rotate(-90deg); }
.admin-select__menu { position: fixed; z-index: 1200; box-sizing: border-box; margin: 0; padding: 6px; list-style: none; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--auth-border); border-radius: 12px; background: var(--auth-surface); box-shadow: var(--auth-shadow); color: var(--auth-text); font: inherit; font-size: 15px; }
.admin-select__option { min-height: 44px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 12px; border-radius: 7px; cursor: pointer; }
.admin-select__option > span { min-width: 0; overflow-wrap: anywhere; }
.admin-select__option > svg { flex-shrink: 0; color: var(--auth-primary); }
.admin-select__option.is-active { background: var(--auth-bg); }
.admin-select__option.is-selected { background: var(--auth-primary-soft); color: var(--auth-primary); font-weight: 600; }
.admin-select__option.is-active:not(.is-disabled) { outline: 2px solid var(--auth-primary); outline-offset: -2px; }
.admin-select__option.is-disabled { color: var(--auth-text-tertiary); cursor: not-allowed; }
.admin-select__empty { padding: 14px 12px; color: var(--auth-text-secondary); text-align: center; }
@media (prefers-reduced-motion: reduce) { .admin-select__trigger, .admin-select__chevron { transition: none; } }
</style>
