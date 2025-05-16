class PrivilegeChecker {
    // 普通用户权限
    static readonly IS_LOGIN = 0; // 登录
    
    static readonly SEND_POST = 1; // 写投稿
    static readonly SEND_COMMENT = 2; // 写评论
    static readonly SEND_MESSAGE = 4; // 发私信

    // 管理员权限
    static readonly MANAGE_POST = 4096; // 管理投稿
    static readonly MANAGE_COMMENT = 8192; // 管理评论
    static readonly MANAGE_USER = 16384; // 管理用户
    static readonly MANAGE_MESSAGE = 32768; // 管理私信
    static readonly MANAGE_SYSTEM = 65536; // 管理系统

    // 检查权限
    static check(userPrivilege: { privilege: number }, privilege: number): boolean {
        return (userPrivilege.privilege & privilege) === privilege
    }
}

export default PrivilegeChecker