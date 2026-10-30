import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND);

export const sendOTPEmail = async ({ userEmail, subject, otp }) => {
    const { data, error } = await resend.emails.send({
        from: 'Acme <contact@myfilespace.xyz>',
        to: userEmail,
        subject,
        html: `<body style="margin:0; padding:0; font-family: Arial, sans-serif; background:#f4f6f8;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
    <tr>
      <td align="center">
        
        <table width="400" cellpadding="0" cellspacing="0" style="background:#ffffff; padding:30px; border-radius:10px;">
          
          <tr>
            <td align="center">
              <h2 style="margin-bottom:10px;">Verify Your Email</h2>
              <p style="color:#555; font-size:14px;">
                Use the OTP below to verify your email address
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 0;">
              <div style="
                font-size:28px;
                font-weight:bold;
                letter-spacing:8px;
                color:#4CAF50;
                background:#f0fdf4;
                padding:15px 25px;
                border-radius:8px;
                display:inline-block;
              ">
                123456
              </div>
            </td>
          </tr>

          <tr>
            <td align="center">
              <p style="color:#777; font-size:13px;">
                This OTP is valid for 5 minutes.
              </p>
              <p style="color:#999; font-size:12px;">
                If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>`,
    });

    if (error) {
        return console.error({ error });
    }

    console.log({ data });
}