
export class Account {
  constructor(
    public uid: string,
    public firstName: string,
    public lastName: string,
    public email: string,
    public phoneNumber: string,
    public photoURL: string,
    public isProfileComplete: boolean
  ) {}
}
