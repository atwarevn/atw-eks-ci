import {Construct} from "constructs";
import {IamPolicy} from "@cdktf/provider-aws/lib/iam-policy";
import albControllerIrsaPolicy from "./iam-policies/alb-controller-irsa-policy.json";
import {IamRole} from "@cdktf/provider-aws/lib/iam-role";
import {IamRolePolicyAttachment} from "@cdktf/provider-aws/lib/iam-role-policy-attachment";
import {DataAwsIamPolicyDocument} from "@cdktf/provider-aws/lib/data-aws-iam-policy-document";

export interface IrsaConfig {
	readonly env: string;
	readonly eksOidcProviderArn: string;
	readonly eksOidcProvider: string;
}

export class Irsa extends Construct {
	constructor(protected scope: Construct, protected id: string, private config: IrsaConfig) {
		super(scope, id);
		this.constructAlbControllerIrsa();
		this.constructRunnerIrsa();
	}

	private constructRunnerIrsa() {
		const role = this.createWebIdentityRole("runner");
		["arn:aws:iam::aws:policy/PowerUserAccess", "arn:aws:iam::aws:policy/IAMFullAccess",].forEach((policyArn, index) => {
			new IamRolePolicyAttachment(this.scope, `iam-policy-attachment-runner-${index}`, {
				role: role.name, policyArn,
			});
		});
	}

	private constructAlbControllerIrsa() {
		const policy = new IamPolicy(this.scope, "alb-controller-irsa-policy", {
			name: `xxx-${this.config.env}-policy-eks-ci-alb-controller`, policy: JSON.stringify(albControllerIrsaPolicy),
		});

		const role = this.createWebIdentityRole("alb-controller");

		new IamRolePolicyAttachment(this.scope, "iam-policy-attachment-alb-controller", {
			role: role.name, policyArn: policy.arn,
		});
	}

	private createWebIdentityRole(name: string) {
		const assumeRolePolicyDocument = new DataAwsIamPolicyDocument(this.scope, `irsa-assume-role-policy-document-${name}`, {
			statement: [{
				principals: [{
					type: "Federated", identifiers: [this.config.eksOidcProviderArn]
				}], actions: ["sts:AssumeRoleWithWebIdentity"], condition: [{
					test: "StringEquals", values: ["sts.amazonaws.com"], variable: `${this.config.eksOidcProvider}:aud`
				}]
			}]
		});

		return new IamRole(this.scope, `role-${name}`, {
			name: `xxx-${this.config.env}-role-eks-ci-${name}`, assumeRolePolicy: assumeRolePolicyDocument.json
		});
	}
}
