// ========== STATE MANAGEMENT ==========
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;

// ========== DOM ELEMENTS ==========
const cartCountElements = document.querySelectorAll('.cart-count');
const toastElement = document.getElementById('toast');

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    updateAuthUI();
    initHamburger();
    initScrollAnimations();
});

// ========== MOBILE HAMBURGER ==========
function initHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('open');
        });
    });
}

// ========== SCROLL ANIMATIONS ==========
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.product-card, .trust-item').forEach(el => {
        observer.observe(el);
    });
}

// ========== TOAST ==========
function showToast(message, type = 'success') {
    if (!toastElement) return;
    toastElement.textContent = message;
    toastElement.className = `toast show ${type}`;
    setTimeout(() => { toastElement.classList.remove('show'); }, 3000);
}

// ========== CART FUNCTIONS ==========
function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountElements.forEach(el => { el.textContent = totalItems; });
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

function addToCart(id, name, price, image) {
    if (!currentUser) {
        showToast('Please log in to add items to cart', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    const existingItem = cart.find(item => item.id === id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id, name, price, image, quantity: 1 });
    }

    saveCart();
    showToast(`${name} added to cart!`);
}

// Format price in INR
function formatINR(amount) {
    return '₹' + amount.toLocaleString('en-IN');
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    window.dispatchEvent(new Event('cartUpdated'));
}

function updateQuantity(id, delta) {
    const item = cart.find(item => item.id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        removeFromCart(id);
        return;
    }
    saveCart();
    window.dispatchEvent(new Event('cartUpdated'));
}

// ========== AUTH UI ==========
function updateAuthUI() {
    const authLinks = document.getElementById('auth-links');
    if (!authLinks) return;

    if (currentUser) {
        authLinks.innerHTML = `
            <span style="color: var(--accent-gold); font-size: 0.88rem; font-weight: 500;">
                <i class="fas fa-user-circle" style="margin-right: 4px;"></i>${currentUser.name}
            </span>
            <a href="#" onclick="logout(event)" style="font-size: 0.88rem; color: var(--text-secondary);">Logout</a>
        `;
    } else {
        authLinks.innerHTML = `
            <a href="login.html" style="font-size: 0.88rem;">Login</a>
            <a href="signup.html" class="btn" style="padding: 8px 20px; font-size: 0.82rem;">Sign Up</a>
        `;
    }
}

function logout(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('currentUser');
    currentUser = null;
    updateAuthUI();
    showToast('Logged out successfully');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);
}

// ========== SECURE AUTH (SHA-256 hashing) ==========
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'trendy_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function registerUser(name, email, password) {
    let users = JSON.parse(localStorage.getItem('users')) || [];

    if (users.find(u => u.email === email)) {
        return { success: false, message: 'Email already registered' };
    }

    const hashedPassword = await hashPassword(password);
    const newUser = { id: Date.now(), name, email, password: hashedPassword };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    return { success: true, message: 'Account created successfully!' };
}

async function loginUser(email, password) {
    let users = JSON.parse(localStorage.getItem('users')) || [];
    const hashedPassword = await hashPassword(password);
    const user = users.find(u => u.email === email && u.password === hashedPassword);

    if (user) {
        const { password, ...safeUser } = user;
        localStorage.setItem('currentUser', JSON.stringify(safeUser));
        currentUser = safeUser;
        return { success: true };
    }

    return { success: false, message: 'Invalid email or password' };
}

// ========== PASSWORD STRENGTH ==========
function checkPasswordStrength(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const colors = ['#e74c5e', '#e74c5e', '#f39c12', '#f1c40f', '#2ecc71', '#27ae60'];
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    const widths = ['10%', '25%', '45%', '65%', '85%', '100%'];

    return { score, color: colors[score], label: labels[score], width: widths[score] };
}

// ========== INPUT SANITIZATION ==========
function sanitizeInput(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
