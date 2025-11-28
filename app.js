// app.js - shared client-side code for ordering
function initOrdering(MENU){
  const order = [];
  const orderItemsEl = document.getElementById('order-items');
  const orderTotalEl = document.getElementById('order-total');
  const placeBtn = document.getElementById('place-order');
  const msgEl = document.getElementById('order-msg');

  // expose addToOrder globally so menu script can call it
  window.addToOrderFunction = (id, qty) => {
    const existing = order.find(x => x.id === id);
    if (existing) existing.qty += qty;
    else order.push({ id, qty });
    renderOrder();
  };

  function renderOrder() {
    if (!orderItemsEl) return;
    orderItemsEl.innerHTML = '';
    let total = 0;
    order.forEach((it, idx) => {
      const m = MENU.find(x => x.id === it.id);
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <div style="flex:1"><strong>${m.name}</strong> × ${it.qty} — ₹${m.price * it.qty}</div>
        <button class="qty-btn" data-idx="${idx}" style="background:#ffebee;color:#c62828;border:1px solid #ef5350;width:28px;height:28px;padding:0;cursor:pointer;border-radius:4px">✕</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        order.splice(idx, 1);
        renderOrder();
      });
      orderItemsEl.appendChild(row);
      total += m.price * it.qty;
    });
    if (order.length === 0) orderItemsEl.innerHTML = '<p style="color:var(--muted);text-align:center;margin:0">No items added yet</p>';
    if (orderTotalEl) orderTotalEl.textContent = total;
  }

  if (placeBtn) {
    placeBtn.addEventListener('click', async () => {
      if (order.length === 0) return showOrderMsg('Add items first', 'error');
      
      const name = prompt('📝 Your name:');
      if (!name) return;
      const email = prompt('📧 Email address:');
      if (!email) return;
      const phone = prompt('📞 Phone number:');
      if (!phone) return;
      
      const payMethodEl = document.getElementById('payment-method');
      const paymentMethod = payMethodEl ? payMethodEl.value : 'pay_on_delivery';
      
      placeBtn.disabled = true;
      placeBtn.textContent = '⏳ Placing order...';

      try {
        let total = 0;
        order.forEach(it => {
          const m = MENU.find(x => x.id === it.id);
          total += m.price * it.qty;
        });

        const resp = await fetch('/api/orders', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ 
            customer: { name, email, phone }, 
            items: order, 
            total,
            paymentMethod: paymentMethod === 'card' ? 'online' : 'cash'
          })
        });

        const raw = await resp.text();
        let json = null;
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch (e) {
            console.error('Invalid JSON from /api/orders:', raw);
            throw new Error(`Invalid JSON response from server (status ${resp.status})`);
          }
        }
        if (!json) {
          if (!resp.ok) throw new Error(`Server returned status ${resp.status} with empty body`);
          throw new Error('Empty response from server');
        }
        if (json.error) throw new Error(json.error);
        const orderId = json.orderId;

        // Handle Razorpay payment if online payment requested
        if (paymentMethod === 'card' && json.payment) {
          const razorpayOrder = json.payment.order;
          const options = {
            key: json.payment.key,
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            name: 'La Bella Restaurant',
            description: `Order #${orderId}`,
            handler: async function(response) {
              try {
                // Verify payment
                const verifyResp = await fetch('/api/payments/verify', {
                  method: 'POST',
                  headers: {'Content-Type':'application/json'},
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    type: 'order',
                    id: orderId
                  })
                });
                const verifyJson = await verifyResp.json();
                if (verifyJson.success) {
                  showOrderMsg(`✓ Order placed and PAID!\nOrder ID: ${orderId}\nPayment ID: ${response.razorpay_payment_id}`, 'success');
                  order.length = 0;
                  renderOrder();
                } else {
                  throw new Error('Payment verification failed');
                }
              } catch (err) {
                showOrderMsg('✗ Payment verification error: ' + err.message, 'error');
              } finally {
                placeBtn.disabled = false;
                placeBtn.textContent = 'Place Order';
              }
            },
            prefill: {
              name: name,
              email: email,
              contact: phone
            },
            notes: {
              orderId: String(orderId)
            }
          };
          if (window.Razorpay) {
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function(response) {
              showOrderMsg('✗ Payment failed: ' + response.error.description, 'error');
              placeBtn.disabled = false;
              placeBtn.textContent = 'Place Order';
            });
            rzp.open();
          } else {
            throw new Error('Razorpay not loaded. Please refresh the page.');
          }
        } else {
          // Cash on delivery
          showOrderMsg(`✓ Order placed!\nOrder ID: ${orderId}\n(Pay on delivery)`, 'success');
          order.length = 0;
          renderOrder();
          placeBtn.disabled = false;
          placeBtn.textContent = 'Place Order';
        }
      } catch (err) {
        showOrderMsg('✗ Error: ' + err.message, 'error');
        placeBtn.disabled = false;
        placeBtn.textContent = 'Place Order';
      }
    });
  }

  function showOrderMsg(txt, type = 'info') {
    if (msgEl) {
      msgEl.textContent = txt;
      msgEl.className = 'order-message ' + type;
    }
  }

  renderOrder();
}
