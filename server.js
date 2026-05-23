require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const { createClient } = require('@supabase/supabase-js');

// Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('CRITICAL: Missing SUPABASE_URL or SUPABASE_KEY in environment variables.');
}

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        supabase: !!supabase,
        env: process.env.NODE_ENV
    });
});

// ===================== PRODUCT ROUTES (Supabase) =====================
app.get('/api/products', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) {
            console.error('Supabase Products Error:', error);
            return res.status(500).json({ error: 'Failed to fetch products.' });
        }
        res.json(data);
    } catch (err) {
        console.error('Products fetch error:', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', parseInt(req.params.id))
            .single();
        if (error || !data) return res.status(404).json({ error: 'Product not found' });
        res.json(data);
    } catch (err) {
        console.error('Product fetch error:', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// ===================== OTP ROUTES =====================
app.post('/api/auth/send-otp', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    const { mobile } = req.body;
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile)) {
        return res.status(400).json({ error: 'Invalid mobile number. Enter a valid 10-digit Indian mobile number.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    
    const { error } = await supabase.from('otps').upsert({ mobile, otp, verified: false, expires_at: expiresAt });

    if (error) {
        console.error('Supabase OTP Error:', error);
        return res.status(500).json({ error: 'Failed to send OTP.' });
    }

    console.log(`\n📱 [OTP] Mobile: ${mobile} | OTP: ${otp}\n`);

    res.json({
        success: true,
        message: 'OTP sent successfully!',
        demo_otp: otp
    });
});

app.post('/api/auth/verify-otp', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    const { mobile, otp } = req.body;
    const { data: stored, error } = await supabase.from('otps').select('*').eq('mobile', mobile).single();

    if (!stored || error) return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    if (new Date() > new Date(stored.expires_at)) {
        await supabase.from('otps').delete().eq('mobile', mobile);
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });

    await supabase.from('otps').update({ verified: true }).eq('mobile', mobile);
    res.json({ success: true, message: 'Mobile number verified successfully!' });
});

// ===================== AUTH ROUTES =====================
app.post('/api/auth/register', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    try {
        const { name, email, mobile, password } = req.body;

        if (!email && !mobile) {
            return res.status(400).json({ error: 'Please provide either an email or a mobile number.' });
        }

        // Validate Gmail
        if (email && !/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)) {
            return res.status(400).json({ error: 'Only Gmail addresses are accepted.' });
        }

        // Validate mobile
        if (mobile && !/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({ error: 'Invalid mobile number.' });
        }

        // Check OTP verified
        if (mobile) {
            const { data: otpData } = await supabase.from('otps').select('*').eq('mobile', mobile).single();
            if (!otpData || !otpData.verified) {
                return res.status(400).json({ error: 'Please verify your mobile number with OTP first.' });
            }
        }

        // Check if user exists
        let query = supabase.from('users').select('*');
        if (email && mobile) {
            query = query.or(`email.eq.${email},mobile.eq.${mobile}`);
        } else if (email) {
            query = query.eq('email', email);
        } else if (mobile) {
            query = query.eq('mobile', mobile);
        }
        
        const { data: existingUsers } = await query;
        if (existingUsers && existingUsers.length > 0) {
            if (email && existingUsers.some(u => u.email === email)) {
                return res.status(400).json({ error: 'Email already registered.' });
            }
            if (mobile && existingUsers.some(u => u.mobile === mobile)) {
                return res.status(400).json({ error: 'Mobile number already registered.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const { data: newUser, error: insertError } = await supabase.from('users').insert([{
            name, email: email || null, mobile: mobile || null, password: hashedPassword
        }]).select().single();

        if (insertError) {
            console.error(insertError);
            return res.status(500).json({ error: 'Failed to create user.' });
        }
        if (mobile) await supabase.from('otps').delete().eq('mobile', mobile);

        const token = jwt.sign({ id: newUser.id, name, email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token,
            user: { id: newUser.id, name, email, mobile }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Backend configuration error: Supabase not connected.' });
    try {
        const { identifier, password } = req.body;

        const isEmail = identifier.includes('@');
        
        if (isEmail && !/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(identifier)) {
            return res.status(400).json({ error: 'Only Gmail addresses are accepted.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq(isEmail ? 'email' : 'mobile', identifier)
            .single();

        if (!user || error) return res.status(401).json({ error: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

        const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// ===================== START SERVER =====================
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`\n🚀 Trendy E-Commerce Server running at http://localhost:${PORT}\n`);
        console.log(`   Products API:  http://localhost:${PORT}/api/products`);
        console.log(`   Auth API:      http://localhost:${PORT}/api/auth/register`);
        console.log(`   OTP API:       http://localhost:${PORT}/api/auth/send-otp\n`);
    });
}
module.exports = app;
