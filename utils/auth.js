import User from "../models/userModel.js";

export async function findUserUsingEmail(email) {
    const user = await User.findOne({ email })
    return user;
}
export function sendErrorIfLoginWithOtherApp(userProvider, loginUserProvider) {
    if (userProvider !== loginUserProvider)
        return `${process.env.FRONTEND_URL}/auth/login?task=${userProvider}`
    else {
        return false
    }
}

export function checkHierarchy(loggineduserRole,userRole) {
    const heirarchy = ["admin", "manager", "user"]
    if (heirarchy.indexOf(loggineduserRole) < heirarchy.indexOf(userRole)) {
        return true
    }
    return false
}
export function checkHierarchyEqualTo(loggineduserRole,userRole) {
    const heirarchy = ["admin", "manager", "user"]
    if (heirarchy.indexOf(loggineduserRole) <= heirarchy.indexOf(userRole)) {
        return true
    }
    return false
}