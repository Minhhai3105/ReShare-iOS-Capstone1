<script setup>
import { nextTick, onMounted, ref } from 'vue'

// Ô xác nhận ngay trong trang, thay cho window.confirm(): một số trình duyệt nhúng (vd. khung trình
// duyệt trong app) chặn hộp thoại, confirm() trả về false ngay mà không hiện gì, khiến nút bấm
// trông như không hoạt động. Không truyền confirmLabel thì chỉ là thông báo với một nút đóng.
const props = defineProps({
  message: { type: String, required: true },
  confirmLabel: { type: String, default: '' },
  cancelLabel: { type: String, default: 'Không' },
  busy: { type: Boolean, default: false },
  confirmDisabled: { type: Boolean, default: false },
  tone: { type: String, default: 'warning' },
})
defineEmits(['confirm', 'cancel'])

const firstButton = ref(null)
onMounted(async () => {
  await nextTick()
  firstButton.value?.focus()
})
</script>

<template>
  <div :class="['inline-confirm', `inline-confirm--${props.tone}`]" role="alertdialog" aria-live="polite">
    <p>{{ props.message }}</p>
    <div class="inline-confirm__actions">
      <button ref="firstButton" type="button" class="auth-btn auth-btn--soft" :disabled="props.busy" @click="$emit('cancel')">
        {{ props.confirmLabel ? props.cancelLabel : 'Đã hiểu' }}
      </button>
      <button v-if="props.confirmLabel" type="button" class="auth-btn auth-btn--primary" :disabled="props.busy || props.confirmDisabled" @click="$emit('confirm')">
        {{ props.busy ? 'Đang xử lý…' : props.confirmLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.inline-confirm { display: grid; gap: 10px; padding: 12px 14px; border-radius: 12px; font-size: 14px; }
.inline-confirm--warning { background: #fff3d6; color: #6b4a00; }
.inline-confirm--danger { background: #fdecea; color: #8c1d18; }
.inline-confirm p { margin: 0; }
.inline-confirm__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
</style>
