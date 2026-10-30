import { OAuth2Client } from "google-auth-library";

export const googleClient = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECTURI
})

export const generateGoogleOAuthUrl = () => {
      const url = googleClient.generateAuthUrl({
            scope:["openid","profile","email"]
      })
      return url
}
export const getGoogleIdToken = async (code) => {
      const {tokens} = await googleClient.getToken(code)
      return (tokens.id_token);
}

export const verifyIDToken = async (idToken) => {
      const loginTicket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })
      if (!loginTicket) {
            res.status(404).json({ error: "Invalid Id token" })
      }
      return loginTicket;
}