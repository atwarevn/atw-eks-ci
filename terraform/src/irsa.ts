import { Construct } from "constructs";
import { IamPolicy } from "@cdktf/provider-aws/lib/iam-policy";
import albControllerIrsaPolicy from "./iam-policies/alb-controller-irsa-policy.json";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamPolicyAttachment } from "@cdktf/provider-aws/lib/iam-policy-attachment";

export interface IrsaConfig {
  readonly env: string;
  readonly eksOidcProviderArn: string;
  readonly eksOidcProvider: string;
}

export class Irsa extends Construct {
  constructor(
    protected scope: Construct,
    protected id: string,
    private config: IrsaConfig
  ) {
    super(scope, id);
    this.constructAlbControllerIrsa();
    this.constructRunnerIrsa();
  }

  private constructRunnerIrsa() {
    const role = this.createWebIdentityRole("runner");
    [
      "arn:aws:iam::aws:policy/PowerUserAccess",
      "arn:aws:iam::aws:policy/IAMFullAccess",
    ].forEach((policyArn, index) => {
      new IamPolicyAttachment(this, `iam-policy-attachment-runner-${index}`, {
        name: `xxx-${this.config.env}-policy-attachment-eks-ci-runner`,
        roles: [role.name],
        policyArn,
      });
    });
  }

  private constructAlbControllerIrsa() {
    const policy = new IamPolicy(this, "alb-controller-irsa-policy", {
      name: `xxx-${this.config.env}-policy-eks-ci-alb-controller`,
      policy: JSON.stringify(albControllerIrsaPolicy),
    });

    const role = this.createWebIdentityRole("alb-controller");

    new IamPolicyAttachment(this, "iam-policy-attachment-alb-controller", {
      name: `xxx-${this.config.env}-policy-attachment-eks-ci-alb-controller`,
      roles: [role.name],
      policyArn: policy.arn,
    });
  }

  private createWebIdentityRole(name: string) {
    return new IamRole(this, `role-${name}`, {
      name: `xxx-${this.config.env}-role-eks-ci-${name}`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: this.config.eksOidcProviderArn,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                [`${this.config.eksOidcProvider}:aud`]: "sts.amazonaws.com",
              },
            },
          },
        ],
      }),
    });
  }
}
