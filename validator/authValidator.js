import * as z from "zod";

export const loginSchema = z.object({
    email: z.email("Enter a valid email"),
    password: z.string().min(5, "Minimum password length must be 5").max(50, "Maximum password length must be 50")
})

export const registerSchema = z.object({
    ...loginSchema.shape,
    name: z.string("Enter a valid string").min(3, "Enter a minimum 3 characters").max(100, "You can enter up to 100 character")
})

export const loginWithGoogleSchema = z.object({
    name: z.string("Enter a valid string").min(3, "Enter a minimum 3 characters").max(100, "You can enter up to 100 character"),
    email: z.email("Enter a valid email"),
    picture: z.url("Picture should be of valid url"),
    sub: z.string("Sub is not valid"),
    iss: z.string().refine((iss) => iss === "https://accounts.google.com" ||
        iss === "accounts.google.com", "Invalid issuer"),
})