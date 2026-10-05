<script setup>
import { reactive, ref } from 'vue'
import { ContactRequestError, submitContact } from '../contactService'

const MAX_NAME_LENGTH = 100
const MAX_EMAIL_LENGTH = 254
const MAX_MESSAGE_LENGTH = 5000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const form = reactive({
  name: '',
  email: '',
  message: '',
})
const errors = reactive({})
const touched = reactive({})
const isSubmitting = ref(false)
const submitState = ref('idle')

function validateField(field) {
  const value = form[field].trim()
  if (!value) {
    errors[field] = 'Trường này là bắt buộc.'
  } else if (field === 'name' && value.length > MAX_NAME_LENGTH) {
    errors[field] = `Họ và tên không được vượt quá ${MAX_NAME_LENGTH} ký tự.`
  } else if (field === 'email' && (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value))) {
    errors[field] = 'Vui lòng nhập địa chỉ email hợp lệ.'
  } else if (field === 'message' && value.length > MAX_MESSAGE_LENGTH) {
    errors[field] = `Nội dung không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự.`
  } else {
    delete errors[field]
  }
}

function validateForm() {
  for (const field of Object.keys(form)) {
    touched[field] = true
    validateField(field)
  }
  return Object.keys(errors).length === 0
}

function onInput(field) {
  submitState.value = 'idle'
  if (touched[field]) validateField(field)
}

async function onSubmit() {
  if (isSubmitting.value) return
  submitState.value = 'idle'
  if (!validateForm()) {
    submitState.value = 'validation-error'
    return
  }

  isSubmitting.value = true
  submitState.value = 'loading'
  try {
    await submitContact({
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    })
    submitState.value = 'success'
    form.name = ''
    form.email = ''
    form.message = ''
    for (const field of Object.keys(touched)) delete touched[field]
  } catch (error) {
    if (error instanceof ContactRequestError && error.status === 429) {
      submitState.value = 'rate-limited'
    } else if (error instanceof ContactRequestError && error.status === 503) {
      submitState.value = 'unavailable'
    } else {
      submitState.value = 'error'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section id="contact" class="section contact-section">
    <div class="landing-container contact-layout">
      <div class="contact-intro">
        <span class="eyebrow"><span class="eyebrow-dot"></span> LIÊN HỆ</span>
        <h2>Chúng tôi sẵn sàng <span>lắng nghe bạn</span></h2>
        <p>Gửi câu hỏi hoặc nội dung cần liên hệ với ReShare.</p>
      </div>

      <form class="contact-form" novalidate @submit.prevent="onSubmit">
        <div class="contact-field">
          <label for="contact-name">Họ và tên</label>
          <input
            id="contact-name"
            v-model="form.name"
            type="text"
            autocomplete="name"
            maxlength="100"
            required
            :aria-invalid="Boolean(touched.name && errors.name)"
            :aria-describedby="touched.name && errors.name ? 'contact-name-error' : undefined"
            @input="onInput('name')"
            @blur="touched.name = true; validateField('name')"
          />
          <small v-if="touched.name && errors.name" id="contact-name-error" class="contact-error">{{ errors.name }}</small>
        </div>

        <div class="contact-field">
          <label for="contact-email">Email</label>
          <input
            id="contact-email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            maxlength="254"
            required
            :aria-invalid="Boolean(touched.email && errors.email)"
            :aria-describedby="touched.email && errors.email ? 'contact-email-error' : undefined"
            @input="onInput('email')"
            @blur="touched.email = true; validateField('email')"
          />
          <small v-if="touched.email && errors.email" id="contact-email-error" class="contact-error">{{ errors.email }}</small>
        </div>

        <div class="contact-field">
          <label for="contact-message">Nội dung liên hệ</label>
          <textarea
            id="contact-message"
            v-model="form.message"
            rows="5"
            maxlength="5000"
            required
            :aria-invalid="Boolean(touched.message && errors.message)"
            :aria-describedby="touched.message && errors.message ? 'contact-message-error' : undefined"
            @input="onInput('message')"
            @blur="touched.message = true; validateField('message')"
          ></textarea>
          <small v-if="touched.message && errors.message" id="contact-message-error" class="contact-error">{{ errors.message }}</small>
        </div>

        <button class="button contact-submit" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Đang gửi…' : 'Gửi liên hệ' }}
        </button>
        <p v-if="submitState === 'validation-error'" class="contact-status contact-status--error" role="alert">
          Vui lòng kiểm tra và hoàn thành các thông tin bắt buộc.
        </p>
        <p v-else-if="submitState === 'loading'" class="contact-status" role="status">Đang gửi yêu cầu…</p>
        <p v-else-if="submitState === 'success'" class="contact-status contact-status--success" role="status">
          Đã tiếp nhận liên hệ của bạn.
        </p>
        <p v-else-if="submitState === 'rate-limited'" class="contact-status contact-status--error" role="alert">
          Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.
        </p>
        <p v-else-if="submitState === 'unavailable'" class="contact-status contact-status--error" role="alert">
          Kênh liên hệ chưa sẵn sàng. Vui lòng thử lại sau.
        </p>
        <p v-else-if="submitState === 'error'" class="contact-status contact-status--error" role="alert">
          Chưa gửi được yêu cầu. Vui lòng thử lại sau.
        </p>
        <p class="contact-disclosure">
          Thông tin bạn cung cấp sẽ được sử dụng để tiếp nhận và phản hồi yêu cầu liên hệ với ReShare.
        </p>
      </form>
    </div>
  </section>
</template>
