/*
 * Registration form → API → Razorpay Checkout.
 *
 * Needs, before this file:
 *   <script>window.TS_API_URL = 'https://api.yourinstitute.in';</script>
 *   <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
 *
 * Page elements used: #registration-form (inputs name, phone, email, studentType,
 * city), #register-btn, #pay-btn, #form-message, and optionally the step
 * indicators #step-1 / #step-2.
 *
 * Concessions: old students, repeaters and optional students are registered but
 * not sent to payment; the team confirms their concession fee first (they show
 * up in the admin panel with their category).
 */
(function () {
  var API = (window.TS_API_URL || '').replace(/\/$/, '') + '/api';
  var form = document.getElementById('registration-form');
  if (!form) return;
  var registerBtn = document.getElementById('register-btn');
  var payBtn = document.getElementById('pay-btn');
  var msg = document.getElementById('form-message');
  var step1 = document.getElementById('step-1');
  var step2 = document.getElementById('step-2');
  var registrationId = null;
  var studentName = '';

  function show(text, kind) {
    msg.textContent = text || '';
    msg.dataset.kind = kind || 'info';
    msg.hidden = !text;
  }

  function setSteps(s1, s2) {
    if (step1) step1.dataset.state = s1;
    if (step2) step2.dataset.state = s2;
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Something went wrong, please try again');
          err.field = data.issues && data.issues[0] && data.issues[0].field;
          throw err;
        }
        return data;
      });
    });
  }

  // Same rules as the server, so students get instant feedback
  function validate(values) {
    var phone = (values.phone || '').replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
    if ((values.name || '').trim().length < 2) return ['name', 'Please enter your full name.'];
    if (!/^[6-9]\d{9}$/.test(phone)) return ['phone', 'Please enter a valid 10-digit mobile number.'];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((values.email || '').trim())) return ['email', 'Please enter a valid email address.'];
    if (!values.studentType) return ['studentType', 'Please select your category.'];
    return null;
  }

  function markInvalid(field) {
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (!field) return;
    var el = form.elements[field];
    if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
  }

  form.addEventListener('input', function (e) {
    if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (registrationId) return;
    var values = Object.fromEntries(new FormData(form).entries());
    var problem = validate(values);
    if (problem) { markInvalid(problem[0]); show(problem[1], 'error'); return; }

    markInvalid(null);
    show('');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Saving…';

    post('/registrations', values)
      .then(function (data) {
        registrationId = data.registrationId;
        studentName = values.name.trim().split(/\s+/)[0];
        form.querySelectorAll('input, select').forEach(function (el) { el.disabled = true; });
        registerBtn.hidden = true;
        setSteps('done', 'active');
        if (values.studentType !== 'new') {
          show('Thanks, ' + studentName + '! You are registered. As an eligible student you get a concession: ' +
            'our team will contact you on ' + values.phone.trim() + ' to confirm your fee and share the payment link.', 'success');
          return;
        }
        payBtn.hidden = false;
        show('Thanks, ' + studentName + '! Your details are saved. Complete payment to confirm your seat.', 'success');
        payBtn.focus();
      })
      .catch(function (err) {
        markInvalid(err.field);
        show(err.message, 'error');
        registerBtn.disabled = false;
        registerBtn.textContent = 'Register now';
      });
  });

  payBtn.addEventListener('click', function () {
    if (!registrationId) return;
    if (typeof window.Razorpay !== 'function') {
      show('The payment window could not load. Please check your internet connection and try again.', 'error');
      return;
    }
    payBtn.disabled = true;
    show('Opening secure payment…', 'info');

    post('/payments/order', { registrationId: registrationId })
      .then(function (order) {
        var rzp = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: order.courseName,
          description: 'Programme fee (incl. GST)',
          prefill: order.prefill,
          theme: { color: '#4A2BE0' },
          handler: function (response) {
            show('Confirming your payment…', 'info');
            post('/payments/verify', response)
              .then(function () {
                payBtn.hidden = true;
                setSteps('done', 'done');
                show('Payment successful! Your seat is confirmed, ' + studentName + '. Razorpay will email your payment receipt.', 'success');
              })
              .catch(function () {
                show('We received your payment but could not confirm it yet. Please contact us with payment ID ' +
                  response.razorpay_payment_id + '.', 'error');
              });
          },
          modal: {
            ondismiss: function () {
              payBtn.disabled = false;
              show('Payment not completed. You can try again whenever you are ready.', 'info');
            },
          },
        });
        rzp.on('payment.failed', function (resp) {
          var reason = resp && resp.error && resp.error.description;
          show('Payment failed' + (reason ? ': ' + reason : '') + '. Please try again.', 'error');
          payBtn.disabled = false;
        });
        show('');
        rzp.open();
      })
      .catch(function (err) {
        show(err.message, 'error');
        payBtn.disabled = false;
      });
  });
})();
